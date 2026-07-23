# Voice UI Best Practices

Reference implementations of a **realtime voice UI** — microphone → Deepgram
streaming STT (Flux) → turn detection → Deepgram TTS (Speak), with start/stop
and barge-in — built the same way across different stacks.

The behaviors are the point, and they're the same everywhere. The companion
guide, [**BEST_PRACTICES.md**](BEST_PRACTICES.md), explains the *why* behind each
one; every example below implements them.

## Examples

| Example | Stack | Status |
|---|---|---|
| [`examples/basic-html-js`](examples/basic-html-js) | Vanilla HTML/CSS/JS + a tiny Node token server. No bundler. | ✅ Ready |
| [`examples/reactjs`](examples/reactjs) | React 19 + Vite (same behaviors, componentized). | ✅ Ready |

Each example is self-contained: its own `package.json`, `.env`, and README with
setup steps. Start with the one that matches your stack.

## The shared guide

[**BEST_PRACTICES.md**](BEST_PRACTICES.md) is framework-independent — read it
once and the concepts apply to every example: keeping the API key server-side,
the single-source-of-truth state machine, turn-taking, barge-in, gap-free
playback, teardown, and accessibility.

## Adding an example

New stacks are welcome. Keep them consistent so the collection reads as one set:

1. Create `examples/<stack-name>/` with its own `package.json` and README.
2. Implement the same behaviors and states described in
   [BEST_PRACTICES.md](BEST_PRACTICES.md) — don't restate the guide, link to it.
3. Keep the Deepgram API key server-side (mint short-lived browser tokens).
4. Add a row to the table above.

## License

MIT
