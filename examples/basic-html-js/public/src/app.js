// Entry point. Wires the UI to the conversation orchestrator and turns raw
// errors into friendly, in-UI messages (Best practice #10 — never leave the
// user staring at a dead button while the real error hides in the console).

import { createUI } from "./ui.js";
import { createConversation } from "./conversation.js";

function friendlyError(err) {
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was blocked. Allow the mic and try again.";
  }
  if (name === "NotFoundError") {
    return "No microphone was found. Plug one in and try again.";
  }
  return err?.message || "Something went wrong. Check the console for details.";
}

function preflight() {
  // Mic capture requires a secure context (https or localhost).
  if (!window.isSecureContext) {
    return "This demo needs a secure context. Open it over http://localhost or https://.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "This browser doesn't support microphone capture (getUserMedia).";
  }
  if (typeof AudioWorkletNode === "undefined") {
    return "This browser doesn't support AudioWorklet.";
  }
  return null;
}

const ui = createUI({
  onStart: () => {
    ui.clearError();
    conversation.start();
  },
  onStop: () => conversation.stop(),
  onInterrupt: () => conversation.interruptResponse(),
});

const conversation = createConversation({
  onState: (s) => ui.setState(s),
  onTranscript: (t) => ui.setTranscript(t),
  onLevel: (l) => ui.setLevel(l),
  onError: (err) => {
    console.error(err);
    ui.showError(friendlyError(err));
  },
  // respond: async (text) => (await fetch("/api/reply", {...})).text(),  // <- LLM goes here
});

const blocker = preflight();
if (blocker) {
  ui.showError(blocker);
  ui.setState("error");
} else {
  ui.setState("idle");
}
