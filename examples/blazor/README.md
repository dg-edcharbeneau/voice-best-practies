# Blazor — Voice UI Best Practices

The same realtime voice UI as [`../basic-html-js`](../basic-html-js) and
[`../reactjs`](../reactjs) — start/stop, voice-activity feedback, turn-taking, and
barge-in — built with **Blazor WebAssembly (.NET 10)**. For the *why* behind every
behavior, read the shared guide: [**BEST_PRACTICES.md**](../../BEST_PRACTICES.md).

> Direct STT/TTS — **not** the Voice Agent platform. There's no LLM; the demo
> echoes you. The one-line spot where an LLM would go is the `respond` seam in
> [`wwwroot/js/conversation.js`](VoiceBestPractices.Client/wwwroot/js/conversation.js).

## How it maps to Blazor

This repo's thesis is that the realtime machinery is **framework-agnostic**:
capture, sockets, playback, and the turn-taking state machine are plain ES modules,
shared in spirit with the vanilla and React examples. Blazor — exactly like React —
owns only the *edges*: turning the orchestrator's callbacks into UI state, and
rendering.

| Concern | Where it lives |
|---|---|
| State machine (idle → connecting → listening → thinking → speaking) | [`wwwroot/js/conversation.js`](VoiceBestPractices.Client/wwwroot/js/conversation.js) |
| Mic / STT / TTS / player / token / config | [`wwwroot/js/`](VoiceBestPractices.Client/wwwroot/js/) (ported from vanilla) |
| Audio-thread capture worklet | [`wwwroot/js/pcm-worklet.js`](VoiceBestPractices.Client/wwwroot/js/pcm-worklet.js) |
| **JS-isolation bridge** — orchestrator callbacks ⇄ .NET | [`wwwroot/js/voice-interop.js`](VoiceBestPractices.Client/wwwroot/js/voice-interop.js) |
| **Blazor seam** — typed interop wrapper, `DotNetObjectReference`, teardown | [`Voice/ConversationInterop.cs`](VoiceBestPractices.Client/Voice/ConversationInterop.cs) |
| State enum + labels + friendly errors (the "edge" logic, in C#) | [`Voice/ConversationState.cs`](VoiceBestPractices.Client/Voice/ConversationState.cs) |
| State holder (the analog of React's `useConversation`) | [`Pages/Home.razor.cs`](VoiceBestPractices.Client/Pages/Home.razor.cs) |
| UI, split into components | [`Components/`](VoiceBestPractices.Client/Components/) |
| Token endpoint (holds the API key) | [`Program.cs`](VoiceBestPractices/Program.cs) |

### JS interop uses JS isolation — two flavors

Both are ES modules loaded on demand; **nothing is attached to `window`**, and there
are no `<script>` tags.

1. **Imported wrapper** for the main feature.
   [`ConversationInterop`](VoiceBestPractices.Client/Voice/ConversationInterop.cs)
   imports `./js/voice-interop.js` with
   `IJSRuntime.InvokeAsync<IJSObjectReference>("import", …)`, hands it a
   `DotNetObjectReference` so Flux turn events / transcript / level / errors call back
   into C#, and disposes the module (catching `JSDisconnectedException`).
2. **Collocated module** for a local DOM job.
   [`Transcript.razor.js`](VoiceBestPractices.Client/Components/Transcript.razor.js)
   lives next to its component and only keeps the transcript scrolled to the newest turn.

Method names and module paths are `const`s (a typo can't silently break a callback),
all interop runs in `OnAfterRenderAsync`/event handlers (never during prerender), and
`StateHasChanged` is always marshalled through `InvokeAsync`.

### Components

- [`Home.razor`](VoiceBestPractices.Client/Pages/Home.razor) — the interactive page.
  Sets `data-state` on the root (drives all state-based CSS) and lays out the panels;
  its [`.razor.cs`](VoiceBestPractices.Client/Pages/Home.razor.cs) holds state and
  wires the interop callbacks.
- [`StatusPanel`](VoiceBestPractices.Client/Components/StatusPanel.razor) composes the
  status row, mic meter, and controls.
- [`StatusIndicator`](VoiceBestPractices.Client/Components/StatusIndicator.razor) ·
  [`MicMeter`](VoiceBestPractices.Client/Components/MicMeter.razor) ·
  [`Controls`](VoiceBestPractices.Client/Components/Controls.razor) ·
  [`Transcript`](VoiceBestPractices.Client/Components/Transcript.razor) ·
  [`ErrorBanner`](VoiceBestPractices.Client/Components/ErrorBanner.razor)

Data flows **down** via `[Parameter]`; events flow **up** via `EventCallback`. Button
enable/disable is derived purely from the machine state, so the controls can't drift
out of sync with what's actually possible.

## Quick start

Requires the **.NET 10 SDK** and a Deepgram API key ([console.deepgram.com](https://console.deepgram.com)).

```sh
cd VoiceBestPractices

# The key lives ONLY on the server. Use an env var…
export DEEPGRAM_API_KEY=your_key
# …or user-secrets (kept out of the repo):
#   dotnet user-secrets set DEEPGRAM_API_KEY your_key

dotnet run
```

Open the URL printed by `dotnet run` (e.g. **https://localhost:7xxx**), click
**Start listening**, allow the mic, and speak. Pause, and it repeats your turn. Talk
over it — or click **Stop speaking** — to trigger barge-in.

> Use `https://localhost` (or `http://localhost`). Microphone capture is blocked on
> insecure origins.

## Architecture

Identical data flow to the other examples (see the vanilla
[README](../basic-html-js/README.md#architecture) for the full diagram): the browser
talks **directly** to Deepgram over WebSockets using a short-lived token. Unlike the
React example there is no separate dev proxy — the ASP.NET Core host serves the
WebAssembly app **and** mints tokens from the same origin, so `fetch("api/token")`
just works.

### Why WebAssembly (not Interactive Server)?

Every signal here is browser-native and high-frequency: mic frames every ~80 ms, level
updates many times a second, audio scheduled sample-accurately. Interactive Server
would push all of that over a SignalR circuit. WebAssembly runs the whole loop in the
browser where the audio actually is, and JS interop is a same-process call.

## Make it a real assistant

Replace `echoResponder` in
[`wwwroot/js/conversation.js`](VoiceBestPractices.Client/wwwroot/js/conversation.js)
with a call to your LLM — it can return a `string` or a `Promise<string>`, or you can
stream tokens straight into `tts.speak()` as they arrive. The capture / turn-taking /
barge-in / playback machinery is unchanged.
