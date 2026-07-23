// Central configuration. Everything tunable lives here so the rest of the code
// reads like prose. Change models / rates in one place.
//
// This module is framework-agnostic — it is byte-for-byte the same idea as the
// React example's src/lib/config.js. Blazor only owns the *edges* (the C#
// interop wrapper and the Razor UI); the realtime core stays in JS.

export const DEEPGRAM_WS = "wss://api.deepgram.com";

// --- Speech-to-text: Deepgram Flux (/v2/listen) ------------------------------
// Flux is built for conversational turn-taking: it emits StartOfTurn,
// EagerEndOfTurn, TurnResumed and EndOfTurn events, which is exactly what a
// voice UI needs for VAD and barge-in — no manual endpointing math.
export const STT = {
  model: "flux-general-en",
  encoding: "linear16",
  sampleRate: 16000, // Flux recommends 16 kHz for raw linear16.
};

// --- Text-to-speech: Deepgram Speak (/v1/speak) ------------------------------
// Streamed so playback can start on the first audio frame.
export const TTS = {
  model: "aura-2-thalia-en",
  encoding: "linear16",
  sampleRate: 24000, // aura-2 streams 24 kHz linear16 cleanly.
};

// --- Microphone capture ------------------------------------------------------
// ~80 ms chunks are Deepgram's recommended streaming granularity: small enough
// for low latency, large enough to avoid per-packet overhead.
export const MIC = {
  targetSampleRate: STT.sampleRate,
  chunkMs: 80,
  // The AudioWorklet is served from the app's wwwroot at this URL.
  workletUrl: "js/pcm-worklet.js",
};

// Fetch a fresh token this many ms before the current one expires.
export const TOKEN_REFRESH_MARGIN_MS = 10_000;
