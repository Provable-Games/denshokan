import type { WSContext, WSEvents, WSMessageReceive } from "hono/ws";
import pg from "pg";
import { pool } from "../db/client.js";

interface Subscription {
  channels: Set<string>;
  gameIds: Set<string>;
  contextIds: Set<number>;
  mintedByIds: Set<number>;
  owners: Set<string>;
  settingsIds: Set<number>;
  objectiveIds: Set<number>;
}

// Valid PG LISTEN channels (from 004_functions.sql + 0002_websocket_triggers.sql)
const VALID_CHANNELS = new Set([
  "token_updates",
  "score_updates",
  "game_over_events",
  "new_tokens",
  "new_games",
  "new_minters",
  "new_settings",
  "new_objectives",
]);

// Map friendly names to PG channels
const CHANNEL_MAP: Record<string, string> = {
  tokens: "token_updates",
  scores: "score_updates",
  game_over: "game_over_events",
  mints: "new_tokens",
  games: "new_games",
  minters: "new_minters",
  settings: "new_settings",
  objectives: "new_objectives",
};

// Reverse map: PG channel names back to friendly names
const REVERSE_CHANNEL_MAP: Record<string, string> = {};
for (const [friendly, pg] of Object.entries(CHANNEL_MAP)) {
  REVERSE_CHANNEL_MAP[pg] = friendly;
}

/** Resolve minter contract addresses to their minted_by (minter_id) integers */
async function resolveMinterAddresses(addresses: string[]): Promise<number[]> {
  try {
    const result = await pool.query<{ minter_id: string }>(
      `SELECT minter_id FROM minters WHERE contract_address = ANY($1)`,
      [addresses],
    );
    return result.rows.map((r) => Number(r.minter_id));
  } catch (e) {
    console.error("[WebSocket] Failed to resolve minter addresses:", e);
    return [];
  }
}

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

function matchesFilters(sub: Subscription, data: Record<string, unknown>): boolean {
  if (sub.gameIds.size > 0) {
    const gameId = data.game_id;
    if (gameId != null && !sub.gameIds.has(String(gameId))) return false;
  }
  if (sub.contextIds.size > 0) {
    const contextId = data.context_id;
    if (contextId == null || !sub.contextIds.has(Number(contextId))) return false;
  }
  if (sub.mintedByIds.size > 0) {
    const mintedBy = data.minted_by;
    if (mintedBy == null || !sub.mintedByIds.has(Number(mintedBy))) return false;
  }
  if (sub.owners.size > 0) {
    const owner = data.owner_address;
    if (owner == null || !sub.owners.has(String(owner).toLowerCase())) return false;
  }
  if (sub.settingsIds.size > 0) {
    const settingsId = data.settings_id;
    if (settingsId == null || !sub.settingsIds.has(Number(settingsId))) return false;
  }
  if (sub.objectiveIds.size > 0) {
    const objectiveId = data.objective_id;
    if (objectiveId == null || !sub.objectiveIds.has(Number(objectiveId))) return false;
  }
  return true;
}

function broadcast(channel: string, payload: unknown) {
  const friendlyName = REVERSE_CHANNEL_MAP[channel] ?? channel;
  const now = Date.now();
  const message = JSON.stringify({
    channel: friendlyName,
    data: payload,
    _timing: { serverTs: now },
  });

  const data = payload as Record<string, unknown>;

  for (const [ws, sub] of clients) {
    if (!sub.channels.has(channel)) continue;
    if (!matchesFilters(sub, data)) continue;

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
        contextIds: new Set(),
        mintedByIds: new Set(),
        owners: new Set(),
        settingsIds: new Set(),
        objectiveIds: new Set(),
      };
      clients.set(ws, sub);
    },

    async onMessage(evt: MessageEvent<WSMessageReceive>, ws: WSContext) {
      try {
        const msg = JSON.parse(String(evt.data)) as {
          type: string;
          channels?: string[];
          gameIds?: string[];
          contextIds?: number[];
          minterAddresses?: string[];
          owners?: string[];
          settingsIds?: number[];
          objectiveIds?: number[];
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
          if (Array.isArray(msg.contextIds)) {
            for (const cid of msg.contextIds) sub.contextIds.add(Number(cid));
          }
          if (Array.isArray(msg.minterAddresses) && msg.minterAddresses.length > 0) {
            const mintedByIds = await resolveMinterAddresses(msg.minterAddresses);
            for (const id of mintedByIds) sub.mintedByIds.add(id);
          }
          if (Array.isArray(msg.owners)) {
            for (const addr of msg.owners) sub.owners.add(String(addr).toLowerCase());
          }
          if (Array.isArray(msg.settingsIds)) {
            for (const sid of msg.settingsIds) sub.settingsIds.add(Number(sid));
          }
          if (Array.isArray(msg.objectiveIds)) {
            for (const oid of msg.objectiveIds) sub.objectiveIds.add(Number(oid));
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
