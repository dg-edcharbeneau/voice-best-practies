import { useEffect, useRef } from "react";

// Live transcript: finished turns stack as list items; the in-progress turn
// shows below as italic interim text (announced via aria-live). We keep the
// list scrolled to the newest turn as it grows.
export function Transcript({ committed, interim }) {
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [committed.length]);

  return (
    <section className="panel" aria-label="Transcript">
      <h2 className="panel-title">Transcript</h2>
      <ul ref={listRef} className="transcript">
        {committed.map((text, i) => (
          <li key={i} className="turn">
            {text}
          </li>
        ))}
      </ul>
      <p className="interim" aria-live="polite">
        {interim}
      </p>
    </section>
  );
}
