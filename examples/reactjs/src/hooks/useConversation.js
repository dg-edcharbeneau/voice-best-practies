// useConversation — the React seam over the framework-agnostic orchestrator.
//
// The state machine (idle → connecting → listening → thinking → speaking) lives
// in ../lib/conversation.js, exactly as in the vanilla example. This hook does
// only the React-specific work: it wires the orchestrator's callbacks to React
// state, keeps one instance for the component's lifetime, and tears the session
// down on unmount (Best practice #8).

import { useCallback, useEffect, useRef, useState } from "react";
import { createConversation } from "../lib/conversation.js";
import { friendlyError, preflight } from "../lib/preflight.js";

const EMPTY_TRANSCRIPT = { committed: [], interim: "" };

export function useConversation({ respond } = {}) {
  const [state, setState] = useState("idle");
  const [transcript, setTranscript] = useState(EMPTY_TRANSCRIPT);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState(null);

  // Create exactly one orchestrator. State setters are stable, so the callbacks
  // below never go stale — no need to recreate the instance on re-render.
  const convoRef = useRef(null);
  if (convoRef.current === null) {
    convoRef.current = createConversation({
      respond,
      onState: (s) => setState(s),
      onLevel: (l) => setLevel(l),
      onTranscript: ({ interim, committed }) => {
        if (committed) {
          // The in-progress turn is final: append it and clear the interim line.
          const text = interim.trim();
          setTranscript((prev) => ({
            committed: text ? [...prev.committed, text] : prev.committed,
            interim: "",
          }));
        } else {
          // Interim update (or reset) — replace the live line in place.
          setTranscript((prev) => ({ ...prev, interim }));
        }
      },
      onError: (err) => {
        console.error(err);
        setError(friendlyError(err));
      },
    });
  }

  // One-time environment check. If the browser can't run the demo, surface it
  // and flip to the error state (Start stays clickable so the user can retry
  // after fixing permissions).
  useEffect(() => {
    const blocker = preflight();
    if (blocker) {
      setError(blocker);
      setState("error");
    }
  }, []);

  // Full teardown when the component unmounts.
  useEffect(() => {
    const convo = convoRef.current;
    return () => convo?.stop();
  }, []);

  const start = useCallback(() => {
    setError(null);
    setTranscript(EMPTY_TRANSCRIPT);
    convoRef.current?.start();
  }, []);

  const stop = useCallback(() => convoRef.current?.stop(), []);

  // Click-driven barge-in: stop the current response without ending the session.
  const interruptResponse = useCallback(
    () => convoRef.current?.interruptResponse(),
    []
  );

  return { state, transcript, level, error, start, stop, interruptResponse };
}
