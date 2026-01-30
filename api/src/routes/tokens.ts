import { Hono } from "hono";
import { eq, desc, and, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { tokens, scoreHistory } from "../db/schema.js";
import { parseTokenId, parseGameId, parseAddress, parsePositiveInt } from "../utils/validation.js";

const app = new Hono();

// GET /tokens - List tokens (paginated, filterable)
app.get("/", async (c) => {
  const gameId = parseGameId(c.req.query("game_id"));
  const owner = parseAddress(c.req.query("owner"));
  const gameOver = c.req.query("game_over");
  const limit = parsePositiveInt(c.req.query("limit"), 50);
  const offset = parsePositiveInt(c.req.query("offset"), 0) - 1;

  const conditions = [];
  if (gameId !== null) conditions.push(eq(tokens.gameId, gameId));
  if (owner !== null) conditions.push(eq(tokens.ownerAddress, owner));
  if (gameOver === "true") conditions.push(eq(tokens.gameOver, true));
  if (gameOver === "false") conditions.push(eq(tokens.gameOver, false));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

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

// GET /tokens/:id - Single token
app.get("/:id", async (c) => {
  const tokenId = parseTokenId(c.req.param("id"));
  if (tokenId === null) {
    return c.json({ error: "Invalid token ID" }, 400);
  }

  const result = await db
    .select()
    .from(tokens)
    .where(eq(tokens.tokenId, tokenId))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Token not found" }, 404);
  }

  return c.json({ data: serializeToken(result[0]) });
});

// GET /tokens/:id/scores - Score history for a token
app.get("/:id/scores", async (c) => {
  const tokenId = parseTokenId(c.req.param("id"));
  if (tokenId === null) {
    return c.json({ error: "Invalid token ID" }, 400);
  }

  const limit = parsePositiveInt(c.req.query("limit"), 100);

  const results = await db
    .select()
    .from(scoreHistory)
    .where(eq(scoreHistory.tokenId, tokenId))
    .orderBy(desc(scoreHistory.blockNumber))
    .limit(Math.min(limit, 500));

  return c.json({
    data: results.map((r) => ({
      ...r,
      tokenId: r.tokenId.toString(),
      score: r.score.toString(),
      blockNumber: r.blockNumber.toString(),
    })),
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
