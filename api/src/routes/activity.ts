import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { tokenEvents, gameStats } from "../db/schema.js";
import { parsePositiveInt, parseGameId } from "../utils/validation.js";

const app = new Hono();

// GET /activity - Recent token events (paginated)
app.get("/", async (c) => {
  const limit = parsePositiveInt(c.req.query("limit"), 50);
  const offset = parsePositiveInt(c.req.query("offset"), 0);
  const eventType = c.req.query("type");

  const conditions = [];
  if (eventType) conditions.push(eq(tokenEvents.eventType, eventType));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(tokenEvents)
      .where(where)
      .orderBy(desc(tokenEvents.blockTimestamp))
      .limit(Math.min(limit, 100))
      .offset(Math.max(offset, 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tokenEvents)
      .where(where),
  ]);

  return c.json({
    data: results.map((r) => ({
      ...r,
      tokenId: r.tokenId.toString(),
      blockNumber: r.blockNumber.toString(),
    })),
    total: countResult[0]?.count ?? 0,
    limit,
    offset: Math.max(offset, 0),
  });
});

// GET /activity/stats - Aggregated stats
app.get("/stats", async (c) => {
  const gameId = parseGameId(c.req.query("game_id"));

  if (gameId !== null) {
    const result = await db
      .select()
      .from(gameStats)
      .where(eq(gameStats.gameId, gameId))
      .limit(1);

    if (result.length === 0) {
      return c.json({ error: "No stats for this game" }, 404);
    }
    return c.json({ data: result[0] });
  }

  // Global stats
  const results = await db.select().from(gameStats).orderBy(desc(gameStats.totalTokens));
  return c.json({ data: results });
});

export default app;
