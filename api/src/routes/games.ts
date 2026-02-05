import { Hono } from "hono";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { games, gameStats, objectives, settings } from "../db/schema.js";
import { parseGameId, parsePositiveInt } from "../utils/validation.js";

const app = new Hono();

/**
 * Resolve a raw path param (numeric gameId or hex address) to gameId + gameAddress.
 */
async function resolveGameId(rawId: string): Promise<{ gameId: number; gameAddress: string } | null> {
  const numericId = parseGameId(rawId);
  if (numericId !== null) {
    const result = await db
      .select({ gameId: games.gameId, contractAddress: games.contractAddress })
      .from(games)
      .where(eq(games.gameId, numericId))
      .limit(1);
    return result.length
      ? { gameId: result[0].gameId, gameAddress: result[0].contractAddress.toLowerCase() }
      : null;
  }
  // Hex address
  const normalized = `0x${BigInt(rawId).toString(16)}`;
  const result = await db
    .select({ gameId: games.gameId, contractAddress: games.contractAddress })
    .from(games)
    .where(eq(games.contractAddress, normalized))
    .limit(1);
  return result.length
    ? { gameId: result[0].gameId, gameAddress: result[0].contractAddress.toLowerCase() }
    : null;
}

// GET /games - List games (paginated)
app.get("/", async (c) => {
  const limit = parsePositiveInt(c.req.query("limit"), 50);
  const offset = parsePositiveInt(c.req.query("offset"), 0);

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(games)
      .orderBy(desc(games.createdAt))
      .limit(Math.min(limit, 100))
      .offset(Math.max(offset, 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(games),
  ]);

  return c.json({
    data: results.map((r) => ({
      ...r,
      lastUpdatedBlock: r.lastUpdatedBlock?.toString() ?? null,
    })),
    total: countResult[0]?.count ?? 0,
    limit,
    offset: Math.max(offset, 0),
  });
});

// GET /games/:id/stats - Game statistics
app.get("/:id/stats", async (c) => {
  const resolved = await resolveGameId(c.req.param("id"));
  if (!resolved) {
    return c.json({ error: "Game not found" }, 404);
  }

  const result = await db
    .select()
    .from(gameStats)
    .where(eq(gameStats.gameId, resolved.gameId))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Game stats not found" }, 404);
  }

  return c.json({ data: result[0] });
});

// GET /games/:id/objectives/:objectiveId - Single objective
app.get("/:id/objectives/:objectiveId", async (c) => {
  const resolved = await resolveGameId(c.req.param("id"));
  if (!resolved) {
    return c.json({ error: "Game not found" }, 404);
  }

  const objectiveId = parsePositiveInt(c.req.param("objectiveId"), -1);
  if (objectiveId < 0) {
    return c.json({ error: "Invalid objective ID" }, 400);
  }

  const result = await db
    .select()
    .from(objectives)
    .where(
      eq(objectives.gameAddress, resolved.gameAddress)
    )
    .orderBy(objectives.objectiveId);

  const match = result.find((r) => r.objectiveId === objectiveId);
  if (!match) {
    return c.json({ error: "Objective not found" }, 404);
  }

  return c.json({
    data: {
      ...match,
      blockNumber: match.blockNumber.toString(),
    },
  });
});

// GET /games/:id/objectives - Objectives for a game
app.get("/:id/objectives", async (c) => {
  const resolved = await resolveGameId(c.req.param("id"));
  if (!resolved) {
    return c.json({ error: "Game not found" }, 404);
  }

  const results = await db
    .select()
    .from(objectives)
    .where(eq(objectives.gameAddress, resolved.gameAddress))
    .orderBy(objectives.objectiveId);

  return c.json({
    data: results.map((r) => ({
      ...r,
      blockNumber: r.blockNumber.toString(),
    })),
  });
});

// GET /games/:id/settings/:settingsId - Single setting
app.get("/:id/settings/:settingsId", async (c) => {
  const resolved = await resolveGameId(c.req.param("id"));
  if (!resolved) {
    return c.json({ error: "Game not found" }, 404);
  }

  const settingsId = parsePositiveInt(c.req.param("settingsId"), -1);
  if (settingsId < 0) {
    return c.json({ error: "Invalid settings ID" }, 400);
  }

  const result = await db
    .select()
    .from(settings)
    .where(
      eq(settings.gameAddress, resolved.gameAddress)
    )
    .orderBy(settings.settingsId);

  const match = result.find((r) => r.settingsId === settingsId);
  if (!match) {
    return c.json({ error: "Setting not found" }, 404);
  }

  return c.json({
    data: {
      ...match,
      blockNumber: match.blockNumber.toString(),
    },
  });
});

// GET /games/:id/settings - Settings for a game
app.get("/:id/settings", async (c) => {
  const resolved = await resolveGameId(c.req.param("id"));
  if (!resolved) {
    return c.json({ error: "Game not found" }, 404);
  }

  const results = await db
    .select()
    .from(settings)
    .where(eq(settings.gameAddress, resolved.gameAddress))
    .orderBy(settings.settingsId);

  return c.json({
    data: results.map((r) => ({
      ...r,
      blockNumber: r.blockNumber.toString(),
    })),
  });
});

// GET /games/:id - Single game detail (MUST be last - catch-all)
app.get("/:id", async (c) => {
  const resolved = await resolveGameId(c.req.param("id"));
  if (!resolved) {
    return c.json({ error: "Game not found" }, 404);
  }

  const result = await db
    .select()
    .from(games)
    .where(eq(games.gameId, resolved.gameId))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Game not found" }, 404);
  }

  const game = result[0];
  return c.json({
    data: {
      ...game,
      lastUpdatedBlock: game.lastUpdatedBlock?.toString() ?? null,
    },
  });
});

export default app;
