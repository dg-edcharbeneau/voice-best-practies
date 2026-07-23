import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In dev, Vite serves the React app on :5173 and proxies the token endpoint to
// the Node server (which holds the Deepgram API key). In prod, `vite build`
// emits ./dist and the Node server serves it directly — no proxy needed.
//
// The proxy target must track the SAME PORT the token server uses (see .env /
// server.mjs). If they drift, /api/token hits whatever else is on the default
// port and returns HTML, which surfaces as: Unexpected token '<' ... is not
// valid JSON.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const serverPort = env.PORT || "3000";
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": `http://localhost:${serverPort}`,
      },
    },
  };
});
