import { Hono } from "hono";
import { eq, desc, asc, sql, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { settings } from "../db/schema.js";
import { parseNonNegativeInt, parseAddress } from "../utils/validation.js";

const app = new Hono();

// GET /settings - All settings, paginated, with optional game_address filter
app.get("/", async (c) => {
  const sortBy = c.req.query("sort_by");
  const sortOrder = c.req.query("sort_order") === "asc" ? "asc" : "desc";
  const limit = parseNonNegativeInt(c.req.query("limit"), 50);
  const offset = parseNonNegativeInt(c.req.query("offset"), 0);
  const gameAddress = parseAddress(c.req.query("game_address"));

  const conditions = [];
  if (gameAddress) {
    conditions.push(eq(settings.gameAddress, gameAddress));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortFields: Record<string, any> = {
    name: settings.name,
    created: settings.createdAt,
  };
  const sortColumn = sortFields[sortBy ?? ""] ?? settings.createdAt;
  const orderBy = sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(settings)
      .where(where)
      .orderBy(orderBy)
      .limit(Math.min(limit, 100))
      .offset(Math.max(offset, 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(settings)
      .where(where),
  ]);

  return c.json({
    data: results.map((r) => ({
      ...r,
      blockNumber: r.blockNumber.toString(),
    })),
    total: countResult[0]?.count ?? 0,
    limit,
    offset: Math.max(offset, 0),
  });
});

// GET /settings/:settingsId - Single setting by composite key
app.get("/:settingsId", async (c) => {
  const settingsId = parseNonNegativeInt(c.req.param("settingsId"), -1);
  if (settingsId < 0) {
    return c.json({ error: "Invalid settings ID" }, 400);
  }

  const gameAddress = parseAddress(c.req.query("game_address"));

  const conditions = [eq(settings.settingsId, settingsId)];
  if (gameAddress) {
    conditions.push(eq(settings.gameAddress, gameAddress));
  }

  const [match] = await db
    .select()
    .from(settings)
    .where(and(...conditions))
    .limit(1);

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

export default app;
