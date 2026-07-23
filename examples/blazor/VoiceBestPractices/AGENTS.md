# VoiceBestPractices

| Setting | Value |
|---------|-------|
| **Interactivity Mode** | WebAssembly |
| **Interactivity Scope** | Per-page |

## What this app is
A realtime voice UI (microphone → Deepgram Flux STT → turn detection → Deepgram
Speak TTS, with barge-in) — the Blazor member of a multi-framework "voice UI best
practices" repo. The shared, framework-independent behaviors are documented in the
repo-root `BEST_PRACTICES.md`.

## Rendering configuration
Per-page Interactive WebAssembly. Created with `dotnet new blazor -int WebAssembly`.

The one interactive page, `Home.razor`, opts in with
`@rendermode @(new InteractiveWebAssemblyRenderMode(prerender: false))`.
**Prerendering is deliberately disabled** there: every capability the page uses
(microphone, Web Audio, WebSockets) is browser-only, so a server prerender pass
would render nothing useful and risk double-initialization.

## Project structure
- **VoiceBestPractices** (server): hosts the app and exposes `GET /api/token` (mints
  short-lived Deepgram tokens) and `POST /api/chat` (optional streaming LLM reply via
  `Microsoft.Extensions.AI` `IChatClient`). All provider API keys live ONLY here.
- **VoiceBestPractices.Client** (WebAssembly): the voice UI.
  - `Pages/Home.razor` (+ `.razor.cs`) — a thin view: injects `ConversationService`,
    re-renders on its `Changed` event, stops the session on unmount. No state/logic here.
  - `Components/` — presentational components (StatusPanel, StatusIndicator, MicMeter,
    Controls, Transcript, ErrorBanner).
  - `Voice/` — `ConversationService` (scoped; holds session state + owns the interop),
    `ConversationInterop` (typed JS-isolation wrapper), and `ConversationState`.
  - `wwwroot/js/` — the framework-agnostic realtime core (ported from the vanilla/React
    examples), `respond.js` (the pluggable "brain": echo default + streaming LLM
    variant), and `voice-interop.js`, the isolated bridge module Blazor imports.

## JS interop
Two flavors of **JS isolation**, both ES modules with no `window.*` globals:
1. **Imported wrapper** — `Voice/ConversationInterop.cs` imports `./js/voice-interop.js`
   via `IJSRuntime.InvokeAsync<IJSObjectReference>("import", ...)`, passes a
   `DotNetObjectReference` for JS→.NET callbacks, and owns disposal.
2. **Collocated module** — `Components/Transcript.razor.js` sits next to its component
   and is imported on demand (imported as `./Components/Transcript.razor.js`).

When editing interop: keep module paths and `[JSInvokable]` method names as `const`;
do all interop in `OnAfterRenderAsync`/event handlers (never during prerender); wrap
`StateHasChanged` in `InvokeAsync`; implement `IAsyncDisposable` and catch
`JSDisconnectedException`.

## Configuration / secrets
`GET /api/token` reads the Deepgram API key from configuration key `DEEPGRAM_API_KEY`
(environment variable or user-secrets) — never from `appsettings.json`, never shipped
to the browser. Token TTL is `Deepgram:TokenTtlSeconds` (default 60).

`POST /api/chat` is enabled only when `OpenAI:ApiKey` is configured (env/user-secrets);
otherwise it returns 501 and the app runs the echo default. Model is `OpenAI:Model`
(default `gpt-4o-mini`); `OpenAI:Endpoint` optionally targets Azure OpenAI or another
OpenAI-compatible service. To use the LLM at runtime, also switch `respond` to
`llmResponder` in `wwwroot/js/voice-interop.js`.

```sh
# dev
export DEEPGRAM_API_KEY=your_key   # or: dotnet user-secrets set DEEPGRAM_API_KEY your_key
export OpenAI__ApiKey=sk-...       # optional; enables /api/chat
dotnet run
```

## Service registration
- Client-side services: `VoiceBestPractices.Client/Program.cs`.
- Server-side services: `VoiceBestPractices/Program.cs` (adds `HttpClient` + the token endpoint).

## Don'ts
- Don't put interactive components in the server project — they fail after WebAssembly handoff.
- Don't set `@rendermode` on `<Routes>` in `App.razor` — that makes interactivity global.
- Don't call JS interop during prerender or in `OnInitialized` — JS isn't available yet.
- Don't put session state or orchestration in components — it lives in `ConversationService`;
  components render its state and forward events.
- Don't put the Deepgram API key in `appsettings.json` or any client-side code.
