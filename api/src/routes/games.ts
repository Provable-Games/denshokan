import { Hono } from "hono";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { games, gameLeaderboards, gameStats, objectives, settings } from "../db/schema.js";
import { parseGameId, parseTokenId, parsePositiveInt } from "../utils/validation.js";

const app = new Hono();

// GET /games - List games
app.get("/", async (c) => {
  const results = await db.select().from(games).orderBy(desc(games.createdAt));
  return c.json({
    data: results.map((r) => ({
      ...r,
      lastUpdatedBlock: r.lastUpdatedBlock?.toString() ?? null,
    })),
  });
});

// GET /games/:id/stats - Game statistics
app.get("/:id/stats", async (c) => {
  const gameId = parseGameId(c.req.param("id"));
  if (gameId === null) {
    return c.json({ error: "Invalid game ID" }, 400);
  }

  const result = await db
    .select()
    .from(gameStats)
    .where(eq(gameStats.gameId, gameId))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Game stats not found" }, 404);
  }

  return c.json({ data: result[0] });
});

// GET /games/:id/leaderboard/position/:tokenId - Token position in leaderboard
app.get("/:id/leaderboard/position/:tokenId", async (c) => {
  const gameId = parseGameId(c.req.param("id"));
  if (gameId === null) {
    return c.json({ error: "Invalid game ID" }, 400);
  }

  const tokenId = parseTokenId(c.req.param("tokenId"));
  if (tokenId === null) {
    return c.json({ error: "Invalid token ID" }, 400);
  }

  const context = parsePositiveInt(c.req.query("context"), 5);

  // Find the token's entry in the leaderboard
  const tokenEntry = await db
    .select()
    .from(gameLeaderboards)
    .where(
      and(
        eq(gameLeaderboards.gameId, gameId),
        eq(gameLeaderboards.tokenId, tokenId),
      ),
    )
    .limit(1);

  if (tokenEntry.length === 0) {
    return c.json({ error: "Token not found in leaderboard" }, 404);
  }

  const rank = tokenEntry[0].rank;

  // Get surrounding entries based on context
  const minRank = Math.max(rank - context, 1);
  const maxRank = rank + context;

  const surrounding = await db
    .select()
    .from(gameLeaderboards)
    .where(
      and(
        eq(gameLeaderboards.gameId, gameId),
        gte(gameLeaderboards.rank, minRank),
        lte(gameLeaderboards.rank, maxRank),
      ),
    )
    .orderBy(gameLeaderboards.rank);

  return c.json({
    data: {
      tokenId: tokenEntry[0].tokenId.toString(),
      rank,
      score: tokenEntry[0].score.toString(),
      surrounding: surrounding.map((r) => ({
        ...r,
        tokenId: r.tokenId.toString(),
        score: r.score.toString(),
      })),
    },
  });
});

// GET /games/:id - Single game detail
app.get("/:id", async (c) => {
  const gameId = parseGameId(c.req.param("id"));
  if (gameId === null) {
    return c.json({ error: "Invalid game ID" }, 400);
  }

  const result = await db
    .select()
    .from(games)
    .where(eq(games.gameId, gameId))
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

// GET /games/:id/leaderboard - Leaderboard for a game
app.get("/:id/leaderboard", async (c) => {
  const gameId = parseGameId(c.req.param("id"));
  if (gameId === null) {
    return c.json({ error: "Invalid game ID" }, 400);
  }

  const limit = parsePositiveInt(c.req.query("limit"), 50);
  const offset = parsePositiveInt(c.req.query("offset"), 0) - 1;

  const results = await db
    .select()
    .from(gameLeaderboards)
    .where(eq(gameLeaderboards.gameId, gameId))
    .orderBy(gameLeaderboards.rank)
    .limit(Math.min(limit, 100))
    .offset(Math.max(offset, 0));

  return c.json({
    data: results.map((r) => ({
      ...r,
      tokenId: r.tokenId.toString(),
      score: r.score.toString(),
    })),
  });
});

// GET /games/:id/objectives - Objectives for a game
app.get("/:id/objectives", async (c) => {
  const gameAddress = c.req.param("id");
  if (!gameAddress) {
    return c.json({ error: "Game address required" }, 400);
  }

  const results = await db
    .select()
    .from(objectives)
    .where(eq(objectives.gameAddress, gameAddress.toLowerCase()))
    .orderBy(objectives.objectiveId);

  return c.json({
    data: results.map((r) => ({
      ...r,
      blockNumber: r.blockNumber.toString(),
    })),
  });
});

// GET /games/:id/settings - Settings for a game
app.get("/:id/settings", async (c) => {
  const gameAddress = c.req.param("id");
  if (!gameAddress) {
    return c.json({ error: "Game address required" }, 400);
  }

  const results = await db
    .select()
    .from(settings)
    .where(eq(settings.gameAddress, gameAddress.toLowerCase()))
    .orderBy(settings.settingsId);

  return c.json({
    data: results.map((r) => ({
      ...r,
      blockNumber: r.blockNumber.toString(),
    })),
  });
});

export default app;
