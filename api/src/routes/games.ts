import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { games, gameLeaderboards, objectives, settings } from "../db/schema.js";
import { parseGameId, parsePositiveInt } from "../utils/validation.js";

const app = new Hono();

// GET /games - List games
app.get("/", async (c) => {
  const results = await db.select().from(games).orderBy(desc(games.createdAt));
  return c.json({ data: results });
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
