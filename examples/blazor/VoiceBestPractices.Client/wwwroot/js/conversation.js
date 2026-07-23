// The conversation orchestrator — the state machine that defines the voice UI's
// *behavior*. This is where the best practices come together, and it is
// deliberately identical in spirit to the React example's src/lib/conversation.js.
//
// The repo's thesis: the realtime machinery is framework-agnostic. Blazor, like
// React, owns only the *edges* — turning these callbacks into UI state (see
// voice-interop.js and ConversationInterop.cs). The state machine itself does
// not know or care that a .NET runtime is on the other side.
//
// States (Best practice #2 — one explicit source of truth):
//   idle       - not connected; nothing captured
//   connecting - opening sockets / acquiring mic
//   listening  - mic live, waiting for or hearing the user
//   thinking   - user's turn ended; producing a response
//   speaking   - TTS audio is playing back
//   error      - something failed; surfaced to the user
//
// Turn-taking + barge-in (Best practices #3, #4) are driven by Flux TurnInfo
// events. See handleSTTEvent below.

import { getToken } from "./token.js";
import { startMic } from "./mic.js";
import { connectSTT } from "./stt.js";
import { connectTTS } from "./tts.js";
import { createPlayer } from "./player.js";
import { TTS } from "./config.js";

// The "response" seam. This demo echoes the user's finished turn back through
// TTS so the full realtime loop (mic -> STT -> turn detection -> TTS -> barge-in)
// is exercised without needing an LLM. Swap this function for a call to your LLM
// — it may return a string or a Promise<string>.
const echoResponder = (finalTranscript) => finalTranscript;

export function createConversation({ onState, onTranscript, onLevel, onError, respond = echoResponder }) {
  let state = "idle";
  let mic = null;
  let stt = null;
  let tts = null;
  let player = null;

  // Tracks the transcript of the turn currently in progress.
  let currentTurn = "";
  // Guards against a late response being spoken after the user barged in.
  let activeTurnIndex = -1;

  function setState(next) {
    if (state === next) return;
    state = next;
    onState?.(state);
  }

  // --- barge-in ---------------------------------------------------------------
  // Called when the user starts talking while the agent is (or is about to be)
  // speaking. Stop playback locally AND tell the server to drop queued audio.
  // Done here in JS at the point of detection so the cut-off is instant
  // (Best practice #4 — barge-in is non-negotiable).
  function interrupt() {
    if (player?.isPlaying) {
      player.flush();
      tts?.clear();
    }
  }

  // Click-driven barge-in: the same cut-off as voice barge-in, but triggered by
  // the user pressing a Stop button instead of speaking. Unlike interrupt(), it
  // also abandons a reply that's still being produced ("thinking") — there's no
  // incoming turn to invalidate it, so we do it here — and always drops us back
  // to "listening". NaN never equals any real turn index, so a pending
  // commitTurn() reply is guaranteed to be discarded.
  function interruptResponse() {
    if (state !== "speaking" && state !== "thinking") return;
    activeTurnIndex = Number.NaN;
    player?.flush();
    tts?.clear();
    setState("listening");
  }

  // --- Flux turn events -------------------------------------------------------
  function handleSTTEvent(msg) {
    if (msg.type !== "TurnInfo") return;

    switch (msg.event) {
      case "StartOfTurn":
        // The user began a new turn. If the agent was talking, cut it off.
        interrupt();
        currentTurn = "";
        setState("listening");
        onTranscript?.({ interim: "", committed: false });
        break;

      case "Update":
        // Interim transcription of the in-progress turn.
        currentTurn = msg.transcript || "";
        onTranscript?.({ interim: currentTurn, committed: false });
        break;

      case "EagerEndOfTurn":
        // Deepgram thinks the user *might* be done. A real app can start
        // preparing (e.g. fire the LLM request) here and cancel on TurnResumed.
        // For the echo demo there's nothing to pre-warm.
        break;

      case "TurnResumed":
        // False alarm — the user kept talking. Cancel anything we started
        // speaking speculatively.
        interrupt();
        setState("listening");
        break;

      case "EndOfTurn":
        // The user is done. Commit the turn and respond.
        currentTurn = msg.transcript || currentTurn;
        onTranscript?.({ interim: currentTurn, committed: true });
        commitTurn(msg.turn_index ?? -1, currentTurn);
        break;
    }
  }

  async function commitTurn(turnIndex, text) {
    const clean = (text || "").trim();
    if (!clean) {
      setState("listening");
      return;
    }
    activeTurnIndex = turnIndex;
    setState("thinking");
    try {
      const reply = await respond(clean);
      // If the user barged in while we were "thinking", abandon this reply.
      if (activeTurnIndex !== turnIndex) return;
      tts?.speak(reply);
      tts?.flush();
      // player.onStart flips us to "speaking"; player.onEnd returns to "listening".
    } catch (err) {
      onError?.(err);
      setState("listening");
    }
  }

  // --- lifecycle --------------------------------------------------------------
  async function start() {
    if (state !== "idle" && state !== "error") return;
    setState("connecting");
    try {
      const token = await getToken();

      player = createPlayer({
        sampleRate: TTS.sampleRate,
        onStart: () => setState("speaking"),
        onEnd: () => {
          // Only fall back to listening if we're not mid-interruption.
          if (state === "speaking" || state === "thinking") setState("listening");
        },
      });
      // Resume the audio context from within the click that called start().
      await player.resume();

      tts = connectTTS({
        token,
        onAudio: (buf) => player.enqueue(buf),
        onError: (e) => onError?.(e),
      });

      stt = connectSTT({
        token,
        onEvent: handleSTTEvent,
        onError: (e) => onError?.(e),
        onClose: () => {
          if (state !== "idle") stop();
        },
      });

      mic = await startMic({
        onFrame: (buf) => stt?.sendAudio(buf),
        onLevel: (lvl) => onLevel?.(lvl),
      });

      setState("listening");
    } catch (err) {
      onError?.(err);
      setState("error");
      await stop();
    }
  }

  async function stop() {
    // Full teardown (Best practice #8). Order matters: stop capturing first.
    mic?.stop();
    stt?.finish();
    stt?.close();
    tts?.close();
    player?.close();
    mic = stt = tts = player = null;
    currentTurn = "";
    activeTurnIndex = -1;
    setState("idle");
  }

  return {
    start,
    stop,
    interruptResponse,
    get state() {
      return state;
    },
  };
}
