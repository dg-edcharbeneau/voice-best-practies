// All DOM reads/writes live here so the rest of the code stays framework-free
// and testable. Accessibility (Best practice #9) is handled in this layer:
// status changes are announced via aria-live, controls are real <button>s, and
// the mic meter is decorative (aria-hidden) with the state text carrying meaning.

const STATE_LABEL = {
  idle: "Idle",
  connecting: "Connecting…",
  listening: "Listening",
  thinking: "Thinking…",
  speaking: "Speaking",
  error: "Error",
};

export function createUI({ onStart, onStop, onInterrupt }) {
  const root = document.getElementById("app");
  const startBtn = document.getElementById("start");
  const stopBtn = document.getElementById("stop");
  const interruptBtn = document.getElementById("interrupt");
  const statusEl = document.getElementById("status");
  const meterFill = document.getElementById("meter-fill");
  const interimEl = document.getElementById("interim");
  const transcriptEl = document.getElementById("transcript");
  const errorEl = document.getElementById("error");

  startBtn.addEventListener("click", () => onStart());
  stopBtn.addEventListener("click", () => onStop());
  interruptBtn.addEventListener("click", () => onInterrupt());

  return {
    setState(state) {
      root.dataset.state = state;
      statusEl.textContent = STATE_LABEL[state] ?? state;
      const running = state !== "idle" && state !== "error";
      startBtn.disabled = running;
      stopBtn.disabled = !running;
      // Only stoppable when there's a response in flight to stop.
      interruptBtn.disabled = state !== "speaking" && state !== "thinking";
      if (state === "idle") {
        meterFill.style.transform = "scaleX(0)";
        interimEl.textContent = "";
      }
    },

    setLevel(level) {
      // level is RMS 0..1; scale for a livelier meter and clamp.
      const scaled = Math.min(1, level * 3);
      meterFill.style.transform = `scaleX(${scaled.toFixed(3)})`;
    },

    setTranscript({ interim, committed }) {
      if (committed) {
        const text = interim.trim();
        if (text) {
          const li = document.createElement("li");
          li.className = "turn";
          li.textContent = text;
          transcriptEl.appendChild(li);
          transcriptEl.scrollTop = transcriptEl.scrollHeight;
        }
        interimEl.textContent = "";
      } else {
        interimEl.textContent = interim;
      }
    },

    showError(message) {
      errorEl.textContent = message;
      errorEl.hidden = !message;
    },

    clearError() {
      errorEl.textContent = "";
      errorEl.hidden = true;
    },
  };
}
