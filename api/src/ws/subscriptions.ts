import type { WSContext, WSEvents, WSMessageReceive } from "hono/ws";
import pg from "pg";
import { pool } from "../db/client.js";

interface Subscription {
  channels: Set<string>;
  gameIds: Set<string>;
}

// Valid PG LISTEN channels (from 004_functions.sql)
const VALID_CHANNELS = new Set([
  "token_updates",
  "score_updates",
  "game_over_events",
  "new_tokens",
]);

// Map friendly names to PG channels
const CHANNEL_MAP: Record<string, string> = {
  tokens: "token_updates",
  scores: "score_updates",
  game_over: "game_over_events",
  mints: "new_tokens",
};

const clients = new Map<WSContext, Subscription>();
let pgClient: pg.PoolClient | null = null;
let initialized = false;

async function initPgListener() {
  if (initialized) return;
  initialized = true;

  try {
    pgClient = await pool.connect();
    for (const channel of VALID_CHANNELS) {
      await pgClient.query(`LISTEN ${channel}`);
    }

    pgClient.on("notification", (msg: pg.Notification) => {
      if (!msg.channel || !msg.payload) return;
      const payload = JSON.parse(msg.payload);
      broadcast(msg.channel, payload);
    });

    pgClient.on("error", () => {
      pgClient = null;
      initialized = false;
    });
  } catch {
    pgClient = null;
    initialized = false;
  }
}

function broadcast(channel: string, payload: unknown) {
  const now = Date.now();
  const message = JSON.stringify({
    channel,
    data: payload,
    _timing: { serverTs: now },
  });

  for (const [ws, sub] of clients) {
    if (!sub.channels.has(channel)) continue;

    if (sub.gameIds.size > 0) {
      const gameId = (payload as Record<string, unknown>)?.game_id;
      if (gameId && !sub.gameIds.has(String(gameId))) continue;
    }

    try {
      ws.send(message);
    } catch {
      clients.delete(ws);
    }
  }
}

/**
 * Returns WSEvents handlers for use with Hono's upgradeWebSocket.
 */
export function createWSEvents(): WSEvents {
  return {
    onOpen(_evt: Event, ws: WSContext) {
      initPgListener();

      const sub: Subscription = {
        channels: new Set(),
        gameIds: new Set(),
      };
      clients.set(ws, sub);
    },

    onMessage(evt: MessageEvent<WSMessageReceive>, ws: WSContext) {
      try {
        const msg = JSON.parse(String(evt.data)) as {
          type: string;
          channels?: string[];
          gameIds?: string[];
        };

        const sub = clients.get(ws);
        if (!sub) return;

        if (msg.type === "subscribe" && Array.isArray(msg.channels)) {
          for (const ch of msg.channels) {
            const pgChannel = CHANNEL_MAP[ch];
            if (pgChannel) sub.channels.add(pgChannel);
          }
          if (Array.isArray(msg.gameIds)) {
            for (const gid of msg.gameIds) sub.gameIds.add(String(gid));
          }
          ws.send(JSON.stringify({ type: "subscribed", channels: [...sub.channels] }));
        }

        if (msg.type === "unsubscribe" && Array.isArray(msg.channels)) {
          for (const ch of msg.channels) {
            const pgChannel = CHANNEL_MAP[ch];
            if (pgChannel) sub.channels.delete(pgChannel);
          }
          ws.send(JSON.stringify({ type: "unsubscribed", channels: [...sub.channels] }));
        }
      } catch (e) {
        console.error("[WebSocket] Error processing message:", e);
        ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
      }
    },

    onClose(_evt: CloseEvent, ws: WSContext) {
      clients.delete(ws);
    },
  };
}
