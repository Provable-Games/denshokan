import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { gameStats } from "../db/schema.js";
import { parseGameId } from "../utils/validation.js";

const app = new Hono();

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
