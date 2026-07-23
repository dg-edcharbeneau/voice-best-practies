// Decorative mic-level meter (VAD feedback). Purely visual, so aria-hidden —
// the meaning lives in the status text. `level` is RMS 0..1; we scale it for a
// livelier bar and clamp. At idle we force it to zero so it rests flat.
export function MicMeter({ level, state }) {
  const scaled = state === "idle" ? 0 : Math.min(1, level * 3);
  return (
    <div className="meter" aria-hidden="true">
      <div
        className="meter-fill"
        style={{ transform: `scaleX(${scaled.toFixed(3)})` }}
      />
    </div>
  );
}
