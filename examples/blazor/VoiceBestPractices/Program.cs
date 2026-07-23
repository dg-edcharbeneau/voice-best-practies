using System.Net.Http.Headers;
using System.Net.Http.Json;
using VoiceBestPractices.Components;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveWebAssemblyComponents();

// Used by the /api/token endpoint to call Deepgram's auth API server-side.
builder.Services.AddHttpClient();

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

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveWebAssemblyRenderMode()
    .AddAdditionalAssemblies(typeof(VoiceBestPractices.Client._Imports).Assembly);

app.Run();
