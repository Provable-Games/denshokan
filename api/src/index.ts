import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";

import { healthCheck, shutdown } from "./db/client.js";
import { rateLimit, cleanupTimer } from "./middleware/rateLimit.js";
import { createWSEvents } from "./ws/subscriptions.js";

import tokensRouter from "./routes/tokens.js";
import gamesRouter from "./routes/games.js";
import activityRouter from "./routes/activity.js";
import playersRouter from "./routes/players.js";
import mintersRouter from "./routes/minters.js";

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Middleware
app.use("*", cors());
app.use("/activity/stats", rateLimit(30));
app.use("*", rateLimit(100));

// Health
app.get("/health", async (c) => {
  const dbOk = await healthCheck();
  return c.json({ status: dbOk ? "ok" : "degraded", db: dbOk }, dbOk ? 200 : 503);
});

// Routes
app.route("/tokens", tokensRouter);
app.route("/games", gamesRouter);
app.route("/activity", activityRouter);
app.route("/players", playersRouter);
app.route("/minters", mintersRouter);

// WebSocket
app.get("/ws", upgradeWebSocket(() => createWSEvents()));

// Server
const port = parseInt(process.env.PORT ?? "3000", 10);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[Denshokan API] Listening on http://localhost:${info.port}`);
});

injectWebSocket(server);

// Graceful shutdown
function handleShutdown() {
  console.log("[Denshokan API] Shutting down...");
  clearInterval(cleanupTimer);
  server.close(async () => {
    await shutdown();
    process.exit(0);
  });
}

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);
