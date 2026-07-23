// -----------------------------------------------------------------------------
// Token server (+ static server for the built app)
//
// Best practice #1: the Deepgram API key NEVER reaches the browser.
// This tiny Node server does two jobs:
//   1. GET /api/token  -> mint a short-lived Deepgram token for the browser
//   2. serve the Vite build in ../dist (production)
//
// In DEV you don't hit this server directly for the UI: Vite serves the React
// app on :5173 and proxies /api/token here (see vite.config.js). In PROD, run
// `npm run build` then this server serves ../dist and the token endpoint from
// one origin.
//
// The browser opens WebSockets DIRECTLY to Deepgram using the short-lived
// token, so audio never round-trips through this server.
// -----------------------------------------------------------------------------

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { DeepgramClient } from "@deepgram/sdk";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST_DIR = join(__dirname, "..", "dist");

const PORT = Number(process.env.PORT || 3000);
const TOKEN_TTL_SECONDS = Number(process.env.TOKEN_TTL_SECONDS || 60);
const API_KEY = process.env.DEEPGRAM_API_KEY;

if (!API_KEY) {
  console.error(
    "\n  Missing DEEPGRAM_API_KEY.\n" +
      "  Copy .env.example to .env and set your key from https://console.deepgram.com\n"
  );
  process.exit(1);
}

// The SDK reads DEEPGRAM_API_KEY from the environment by default; we pass it
// explicitly to keep the dependency obvious.
const deepgram = new DeepgramClient({ apiKey: API_KEY });

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

// --- GET /api/token ----------------------------------------------------------
// Returns { access_token, expires_in }. The browser uses access_token as the
// "bearer" WebSocket subprotocol when connecting to Deepgram.
async function handleToken(res) {
  try {
    const result = await deepgram.auth.v1.tokens.grant({
      ttl_seconds: TOKEN_TTL_SECONDS,
    });
    send(res, 200, JSON.stringify(result), {
      "Content-Type": "application/json; charset=utf-8",
      // Tokens are per-session secrets: never let a proxy or the browser cache them.
      "Cache-Control": "no-store",
    });
  } catch (err) {
    console.error("Failed to grant token:", err);
    send(res, 502, JSON.stringify({ error: "token_grant_failed" }), {
      "Content-Type": "application/json; charset=utf-8",
    });
  }
}

// --- static files (production build) -----------------------------------------
async function handleStatic(req, res) {
  // Resolve within DIST_DIR and reject path traversal.
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const relPath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = normalize(join(DIST_DIR, relPath));

  if (!filePath.startsWith(DIST_DIR)) {
    return send(res, 403, "Forbidden");
  }

  try {
    const data = await readFile(filePath);
    const type = CONTENT_TYPES[extname(filePath)] || "application/octet-stream";
    send(res, 200, data, { "Content-Type": type });
  } catch {
    // No build yet? Point the developer at the right command.
    send(
      res,
      404,
      "Not found. In dev, open http://localhost:5173 (Vite). For a production " +
        "server, run `npm run build` first so ../dist exists."
    );
  }
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url.split("?")[0] === "/api/token") {
    return handleToken(res);
  }
  if (req.method === "GET") {
    return handleStatic(req, res);
  }
  send(res, 405, "Method not allowed");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\n  Port ${PORT} is already in use.\n` +
        `  Something else (another server, Docker, etc.) is listening there.\n` +
        `  Free it, or start on a different port:\n\n` +
        `      PORT=3100 npm run dev\n\n` +
        `  (or set PORT in your .env file)\n`
    );
  } else {
    console.error("\n  Server failed to start:", err.message, "\n");
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n  Voice UI best-practices (React) token server on :${PORT}`);
  console.log(`  Dev UI:  http://localhost:5173  (Vite; proxies /api/token here)`);
  console.log(`  Prod UI: http://localhost:${PORT}  (after \`npm run build\`)\n`);
  console.log(`  Token TTL: ${TOKEN_TTL_SECONDS}s  |  API key: server-side only\n`);
});
