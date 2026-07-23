using System.ClientModel;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.AI;
using OpenAI;
using VoiceBestPractices.Components;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveWebAssemblyComponents();

// Used by the /api/token endpoint to call Deepgram's auth API server-side.
builder.Services.AddHttpClient();

// Optional server-side LLM for the "make it a real assistant" variant. Registered
// ONLY when a key is configured, so the echo demo runs with nothing set up. The
// model API key lives server-side, exactly like the Deepgram key. Microsoft.Extensions.AI's
// IChatClient keeps this provider-agnostic — point OpenAI:Endpoint at Azure OpenAI
// or any OpenAI-compatible service, or swap the client for another provider.
var openAiKey = builder.Configuration["OpenAI:ApiKey"];
if (!string.IsNullOrWhiteSpace(openAiKey))
{
    var model = builder.Configuration["OpenAI:Model"] ?? "gpt-4o-mini";
    var endpoint = builder.Configuration["OpenAI:Endpoint"];
    var openAiClient = string.IsNullOrWhiteSpace(endpoint)
        ? new OpenAIClient(openAiKey)
        : new OpenAIClient(new ApiKeyCredential(openAiKey), new OpenAIClientOptions { Endpoint = new Uri(endpoint) });
    builder.Services.AddSingleton<IChatClient>(openAiClient.GetChatClient(model).AsIChatClient());
}

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseWebAssemblyDebugging();
}
else
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}
app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);
app.UseHttpsRedirection();

app.UseAntiforgery();

// -----------------------------------------------------------------------------
// GET /api/token  — Best practice #1: the Deepgram API key NEVER reaches the
// browser. The WebAssembly client fetches a short-lived token from this endpoint
// (same origin, since this host also serves the app), then opens WebSockets
// DIRECTLY to Deepgram with it. Audio never round-trips through this server.
//
// A token only needs to be valid for the WebSocket handshake — once a socket is
// open, the token expiring does not close it — so a 30–60s TTL is plenty.
//
// The key is read from configuration (env var DEEPGRAM_API_KEY, user-secrets, or
// appsettings) and is never serialized to the client.
// -----------------------------------------------------------------------------
app.MapGet("/api/token", async (
    HttpContext http,
    IHttpClientFactory httpClientFactory,
    IConfiguration config,
    ILoggerFactory loggerFactory) =>
{
    var logger = loggerFactory.CreateLogger("TokenEndpoint");

    var apiKey = config["DEEPGRAM_API_KEY"] ?? config["Deepgram:ApiKey"];
    if (string.IsNullOrWhiteSpace(apiKey))
    {
        logger.LogError(
            "Missing DEEPGRAM_API_KEY. Set it via environment variable, user-secrets, " +
            "or appsettings. Get a key at https://console.deepgram.com");
        return Results.Problem(
            "Server is not configured with a Deepgram API key.",
            statusCode: StatusCodes.Status500InternalServerError);
    }

    var ttlSeconds = config.GetValue<int?>("Deepgram:TokenTtlSeconds") ?? 60;

    var client = httpClientFactory.CreateClient();
    using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.deepgram.com/v1/auth/grant");
    // Deepgram uses the "Token" scheme (not "Bearer") for API-key auth.
    request.Headers.Authorization = new AuthenticationHeaderValue("Token", apiKey);
    request.Content = JsonContent.Create(new { ttl_seconds = ttlSeconds });

    using var response = await client.SendAsync(request);
    if (!response.IsSuccessStatusCode)
    {
        var detail = await response.Content.ReadAsStringAsync();
        logger.LogError("Deepgram token grant failed ({Status}): {Detail}", (int)response.StatusCode, detail);
        return Results.Problem("token_grant_failed", statusCode: StatusCodes.Status502BadGateway);
    }

    // Pass the { access_token, expires_in } payload straight through to the browser.
    var payload = await response.Content.ReadAsStringAsync();
    // Tokens are per-session secrets: never let a proxy or the browser cache them.
    http.Response.Headers.CacheControl = "no-store";
    return Results.Content(payload, "application/json");
});

// -----------------------------------------------------------------------------
// POST /api/chat — the "brain" (the LLM insertion point). The browser's `respond`
// seam posts a finished turn here; we stream the assistant's reply back token-by-
// token as plain UTF-8 text so the client can pipe it into TTS as it arrives
// (low latency — don't wait for the whole completion). The model API key stays
// server-side. Returns 501 when no LLM is configured, so the echo demo is untouched.
//
// Barge-in: `cancellationToken` is the request-aborted token. When the browser
// aborts the fetch (the user talked over the agent), generation stops here too —
// no wasted tokens on an abandoned turn.
// -----------------------------------------------------------------------------
app.MapPost("/api/chat", async (
    ChatRequest request,
    IServiceProvider services,
    HttpContext http,
    CancellationToken cancellationToken) =>
{
    var chat = services.GetService<IChatClient>();
    if (chat is null)
    {
        return Results.Problem(
            "No LLM is configured. Set OpenAI:ApiKey to enable /api/chat.",
            statusCode: StatusCodes.Status501NotImplemented);
    }

    var prompt = (request.Transcript ?? string.Empty).Trim();
    if (prompt.Length == 0)
    {
        return Results.BadRequest("Transcript is empty.");
    }

    var messages = new List<ChatMessage>
    {
        new(ChatRole.System,
            "You are a concise, friendly voice assistant. Reply in one or two short " +
            "sentences meant to be spoken aloud. No markdown, lists, or emoji."),
        new(ChatRole.User, prompt),
    };

    http.Response.ContentType = "text/plain; charset=utf-8";
    await foreach (var update in chat.GetStreamingResponseAsync(messages, cancellationToken: cancellationToken))
    {
        if (!string.IsNullOrEmpty(update.Text))
        {
            await http.Response.WriteAsync(update.Text, cancellationToken);
            await http.Response.Body.FlushAsync(cancellationToken);
        }
    }
    return Results.Empty;
});

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveWebAssemblyRenderMode()
    .AddAdditionalAssemblies(typeof(VoiceBestPractices.Client._Imports).Assembly);

app.Run();

/// <summary>Body of a POST /api/chat request: the user's finished turn.</summary>
internal sealed record ChatRequest(string Transcript);
