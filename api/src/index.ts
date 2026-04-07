import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";

import { healthCheck, getLatestIndexedBlock, shutdown } from "./db/client.js";
import { rateLimit, cleanupTimer } from "./middleware/rateLimit.js";
import { handleWSConnection, shutdownWS } from "./ws/subscriptions.js";

import tokensRouter from "./routes/tokens.js";
import gamesRouter from "./routes/games.js";
import activityRouter from "./routes/activity.js";
import playersRouter from "./routes/players.js";
import mintersRouter from "./routes/minters.js";
import settingsRouter from "./routes/settings.js";
import objectivesRouter from "./routes/objectives.js";

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Middleware
app.use("*", cors());
app.use("/activity/stats", rateLimit(60));
app.use("*", rateLimit(300));

// Health
app.get("/health", async (c) => {
  const [dbOk, latestBlock] = await Promise.all([
    healthCheck(),
    getLatestIndexedBlock(),
  ]);
  return c.json({ status: dbOk ? "ok" : "degraded", db: dbOk, latestBlock }, dbOk ? 200 : 503);
});

// Routes
app.route("/tokens", tokensRouter);
app.route("/games", gamesRouter);
app.route("/activity", activityRouter);
app.route("/players", playersRouter);
app.route("/minters", mintersRouter);
app.route("/settings", settingsRouter);
app.route("/objectives", objectivesRouter);

// WebSocket
app.get("/ws", upgradeWebSocket((c) => ({
  onOpen(_evt, ws) {
    handleWSConnection(ws.raw as import("ws").WebSocket);
  },
})));

// Server
const port = parseInt(process.env.PORT ?? "3000", 10);
const certPath = process.env.TLS_CERT ?? "localhost-cert.pem";
const keyPath = process.env.TLS_KEY ?? "localhost-key.pem";

let serverOptions: Parameters<typeof serve>[0] = { fetch: app.fetch, port };

try {
  const cert = readFileSync(certPath);
  const key = readFileSync(keyPath);
  serverOptions = { ...serverOptions, createServer, serverOptions: { cert, key } };
  console.log(`[Denshokan API] TLS certs loaded from ${certPath}`);
} catch {
  console.log(`[Denshokan API] TLS certs not found, falling back to HTTP`);
}

const server = serve(serverOptions, (info) => {
  const protocol = serverOptions.createServer ? "https" : "http";
  console.log(`[Denshokan API] Listening on ${protocol}://localhost:${info.port}`);
});

injectWebSocket(server);

// Graceful shutdown
function handleShutdown() {
  console.log("[Denshokan API] Shutting down...");
  clearInterval(cleanupTimer);
  shutdownWS();
  server.close(async () => {
    await shutdown();
    process.exit(0);
  });
}

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);
