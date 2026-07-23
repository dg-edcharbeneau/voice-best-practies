// The three real <button>s. Disabled state is derived purely from the machine
// state so the buttons can never get out of sync with what's actually possible:
//   Start        — only when not already running
//   Stop speaking — only when there's a response in flight to cut off
//   Stop         — whenever a session is running (full teardown)
export function Controls({ state, onStart, onStop, onInterrupt }) {
  const running = state !== "idle" && state !== "error";
  const canInterrupt = state === "speaking" || state === "thinking";

  return (
    <div className="controls">
      <button
        type="button"
        className="btn btn-primary"
        onClick={onStart}
        disabled={running}
      >
        Start listening
      </button>
      <button
        type="button"
        className="btn"
        onClick={onInterrupt}
        disabled={!canInterrupt}
      >
        Stop speaking
      </button>
      <button
        type="button"
        className="btn"
        onClick={onStop}
        disabled={!running}
      >
        Stop
      </button>
    </div>
  );
}
