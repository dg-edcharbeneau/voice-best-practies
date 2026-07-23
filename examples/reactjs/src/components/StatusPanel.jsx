import { StatusIndicator } from "./StatusIndicator.jsx";
import { MicMeter } from "./MicMeter.jsx";
import { Controls } from "./Controls.jsx";

// Groups the status text, the mic meter, and the controls into one panel — the
// interactive heart of the demo.
export function StatusPanel({ state, level, onStart, onStop, onInterrupt }) {
  return (
    <section className="panel status-panel" aria-label="Session status">
      <StatusIndicator state={state} />
      <MicMeter level={level} state={state} />
      <Controls
        state={state}
        onStart={onStart}
        onStop={onStop}
        onInterrupt={onInterrupt}
      />
    </section>
  );
}
