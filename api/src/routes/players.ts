import { Hono } from "hono";
import { eq, and, desc, sql, countDistinct } from "drizzle-orm";
import { db } from "../db/client.js";
import { tokens } from "../db/schema.js";
import { parseAddress, parseGameId, parsePositiveInt } from "../utils/validation.js";

const app = new Hono();

// GET /players/:address/tokens - Player's tokens with filtering
app.get("/:address/tokens", async (c) => {
  const address = parseAddress(c.req.param("address"));
  if (address === null) {
    return c.json({ error: "Invalid address" }, 400);
  }

  const gameId = parseGameId(c.req.query("game_id"));
  const gameOver = c.req.query("game_over");
  const limit = parsePositiveInt(c.req.query("limit"), 50);
  const offset = parsePositiveInt(c.req.query("offset"), 0);

  const conditions = [eq(tokens.ownerAddress, address)];
  if (gameId !== null) conditions.push(eq(tokens.gameId, gameId));
  if (gameOver === "true") conditions.push(eq(tokens.gameOver, true));
  if (gameOver === "false") conditions.push(eq(tokens.gameOver, false));

  const where = and(...conditions);

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(tokens)
      .where(where)
      .orderBy(desc(tokens.lastUpdatedAt))
      .limit(Math.min(limit, 100))
      .offset(Math.max(offset, 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tokens)
      .where(where),
  ]);

  return c.json({
    data: results.map(serializeToken),
    total: countResult[0]?.count ?? 0,
    limit,
    offset: Math.max(offset, 0),
  });
});

// GET /players/:address/stats - Aggregated player statistics
app.get("/:address/stats", async (c) => {
  const address = parseAddress(c.req.param("address"));
  if (address === null) {
    return c.json({ error: "Invalid address" }, 400);
  }

  const result = await db
    .select({
      totalTokens: sql<number>`count(*)::int`,
      gamesPlayed: countDistinct(tokens.gameId),
      completedGames: sql<number>`count(*) filter (where ${tokens.gameOver} = true)::int`,
      activeGames: sql<number>`count(*) filter (where ${tokens.gameOver} = false)::int`,
      totalScore: sql<string>`coalesce(sum(${tokens.currentScore}), 0)`,
    })
    .from(tokens)
    .where(eq(tokens.ownerAddress, address));

  const stats = result[0];

  return c.json({
    data: {
      address,
      totalTokens: stats?.totalTokens ?? 0,
      gamesPlayed: stats?.gamesPlayed ?? 0,
      completedGames: stats?.completedGames ?? 0,
      activeGames: stats?.activeGames ?? 0,
      totalScore: (stats?.totalScore ?? "0").toString(),
    },
  });
});

function serializeToken(t: typeof tokens.$inferSelect) {
  return {
    ...t,
    tokenId: t.tokenId.toString(),
    mintedBy: t.mintedBy.toString(),
    currentScore: t.currentScore.toString(),
    createdAtBlock: t.createdAtBlock.toString(),
    lastUpdatedBlock: t.lastUpdatedBlock.toString(),
  };
}

export default app;
