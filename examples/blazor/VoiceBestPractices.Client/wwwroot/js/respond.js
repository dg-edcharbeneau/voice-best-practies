// The "response" seam (Best practice #11 — keep the response logic pluggable).
// A responder turns the user's finished turn into speech. It gets:
//
//   respond(transcript, { signal, speak, flush })
//
//   signal  - an AbortSignal that fires on barge-in; abort any in-flight work
//   speak   - queue text for TTS
//   flush   - force TTS to synthesize what's been queued so far
//
// A responder may EITHER return a string (the orchestrator speaks it), OR stream
// speech itself via speak()/flush() and return nothing. Both are supported so the
// simple echo case stays a one-liner while the LLM case can stream.

// --- echo: the demo default -------------------------------------------------
// No brain — just say the user's words back, exercising the full realtime loop
// (mic -> STT -> turn detection -> TTS -> barge-in) without needing an LLM.
export const echoResponder = (finalTranscript) => finalTranscript;

// --- LLM: server-backed assistant -------------------------------------------
// Posts the finished turn to our own /api/chat endpoint, which holds the model
// API key and streams the reply back as plain-text tokens. We speak complete
// sentences as they arrive (low latency) rather than waiting for the whole reply.
//
// The server call goes to OUR server, not the model provider directly — the model
// key never reaches the browser, exactly like the Deepgram token (Best practice #1).
export async function llmResponder(transcript, { signal, speak, flush }) {
  const res = await fetch("api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
    signal, // aborting the fetch cancels generation server-side too
  });
  if (!res.ok || !res.body) {
    throw new Error(`Chat request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  const speakCompleteSentences = () => {
    // Split on sentence boundaries; keep the trailing fragment for next time.
    const parts = pending.split(/(?<=[.!?])\s+/);
    pending = parts.pop() ?? "";
    for (const sentence of parts) {
      if (sentence.trim()) {
        speak(sentence);
        flush();
      }
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    speakCompleteSentences();
  }

  // Speak whatever's left that didn't end with punctuation.
  if (pending.trim()) {
    speak(pending);
    flush();
  }
  // Streamed directly — nothing to return.
}
