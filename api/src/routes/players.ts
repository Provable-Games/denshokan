import { Hono } from "hono";
import { eq, and, desc, asc, sql, countDistinct } from "drizzle-orm";
import { db } from "../db/client.js";
import { tokens } from "../db/schema.js";
import { parseAddress, parseGameId, parseNonNegativeInt } from "../utils/validation.js";

const app = new Hono();

// GET /players/:address/tokens - Player's tokens with filtering
app.get("/:address/tokens", async (c) => {
  const address = parseAddress(c.req.param("address"));
  if (address === null) {
    return c.json({ error: "Invalid address" }, 400);
  }

  const gameId = parseGameId(c.req.query("game_id"));
  const gameOver = c.req.query("game_over");
  const sortBy = c.req.query("sort_by");
  const sortOrder = c.req.query("sort_order") === "asc" ? "asc" : "desc";
  const limit = parseNonNegativeInt(c.req.query("limit"), 50);
  const offset = parseNonNegativeInt(c.req.query("offset"), 0);

  const conditions = [eq(tokens.ownerAddress, address)];
  if (gameId !== null) conditions.push(eq(tokens.gameId, gameId));
  if (gameOver === "true") conditions.push(eq(tokens.gameOver, true));
  if (gameOver === "false") conditions.push(eq(tokens.gameOver, false));

  const where = and(...conditions);

  const sortFields: Record<string, any> = {
    score: tokens.currentScore,
    minted: tokens.mintedAt,
    updated: tokens.lastUpdatedAt,
    start: tokens.startDelay,
    end: tokens.endDelay,
    name: tokens.playerName,
  };
  const sortColumn = sortFields[sortBy ?? ""] ?? tokens.lastUpdatedAt;
  const orderBy = sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(tokens)
      .where(where)
      .orderBy(orderBy)
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
  const { tokenUriFetched, ...rest } = t;
  return {
    ...rest,
    tokenId: rest.tokenId.toString(),
    mintedBy: rest.mintedBy.toString(),
    currentScore: rest.currentScore.toString(),
    createdAtBlock: rest.createdAtBlock.toString(),
    lastUpdatedBlock: rest.lastUpdatedBlock.toString(),
  };
}

export default app;
