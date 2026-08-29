import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";

import { healthCheck, getLatestIndexedBlock, shutdown } from "./db/client.js";
import { rateLimit, cleanupTimer } from "./middleware/rateLimit.js";
import { identifyCaller, describeKeyPolicy } from "./middleware/apiKey.js";
import { handleWSConnection, shutdownWS } from "./ws/subscriptions.js";
import { describeUriPolicy } from "./utils/uriAccess.js";

import tokensRouter from "./routes/tokens.js";
import gamesRouter from "./routes/games.js";
import playersRouter from "./routes/players.js";
import mintersRouter from "./routes/minters.js";
import settingsRouter from "./routes/settings.js";
import objectivesRouter from "./routes/objectives.js";

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Middleware
//
// CORS_ORIGIN is a comma-separated origin allowlist
// (e.g. https://denshokan.gg,http://localhost:5173). Unset means allow any
// origin, which is what this served before the variable was wired up.
const corsOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const corsAllowsAll = corsOrigins.length === 0 || corsOrigins.includes("*");

// `X-API-Key` and `Authorization` must be allowed explicitly or a browser
// preflight will strip them and every keyed request from the client silently
// falls back to the anonymous tier. The exposed headers let a browser app read
// its own budget and see when a tokenUri was withheld rather than missing.
const corsOptions = {
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "X-API-Key", "Authorization"],
  exposeHeaders: [
    "X-Token-Uri-Omitted",
    "RateLimit-Limit",
    "RateLimit-Remaining",
    "RateLimit-Reset",
    "Retry-After",
  ],
  maxAge: 86_400,
};

app.use(
  "*",
  cors({ ...corsOptions, origin: corsAllowsAll ? "*" : corsOrigins }),
);

// Identify before limiting: the rate limiter buckets keyed callers by key and
// anonymous ones by IP, so it needs the caller resolved first.
app.use("*", identifyCaller);

// A page of tokens is ~1 KB/row, so an anonymous caller pinned to this limit
// still moves real bandwidth. 60/min is enough for a browsing user and well
// under what a scraper wants; bulk consumers should take a key.
app.use("*", rateLimit({ anonymous: 60, keyed: 600 }));

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
  console.log(
    `[Denshokan API] CORS: ${corsAllowsAll ? "any origin" : corsOrigins.join(", ")}`,
  );
  console.log(`[Denshokan API] ${describeUriPolicy()}`);
  console.log(`[Denshokan API] ${describeKeyPolicy()}`);
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
