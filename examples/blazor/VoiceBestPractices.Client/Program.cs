using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using VoiceBestPractices.Client.Voice;

var builder = WebAssemblyHostBuilder.CreateDefault(args);

// The voice session manager. Scoped == one instance for the app's lifetime in
// WebAssembly; it owns the JS interop and holds the conversation state.
builder.Services.AddScoped<ConversationService>();

await builder.Build().RunAsync();
