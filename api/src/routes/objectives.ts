import { Hono } from "hono";
import { eq, desc, asc, sql, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { objectives } from "../db/schema.js";
import { parseNonNegativeInt, parseAddress } from "../utils/validation.js";

const app = new Hono();

// GET /objectives - All objectives, paginated, with optional game_address filter
app.get("/", async (c) => {
  const sortBy = c.req.query("sort_by");
  const sortOrder = c.req.query("sort_order") === "asc" ? "asc" : "desc";
  const limit = parseNonNegativeInt(c.req.query("limit"), 50);
  const offset = parseNonNegativeInt(c.req.query("offset"), 0);
  const gameAddress = parseAddress(c.req.query("game_address"));

  const conditions = [];
  if (gameAddress) {
    conditions.push(eq(objectives.gameAddress, gameAddress));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortFields: Record<string, any> = {
    name: objectives.name,
    created: objectives.createdAt,
  };
  const sortColumn = sortFields[sortBy ?? ""] ?? objectives.createdAt;
  const orderBy = sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(objectives)
      .where(where)
      .orderBy(orderBy)
      .limit(Math.min(limit, 100))
      .offset(Math.max(offset, 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(objectives)
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

// GET /objectives/:objectiveId - Single objective by composite key
app.get("/:objectiveId", async (c) => {
  const objectiveId = parseNonNegativeInt(c.req.param("objectiveId"), -1);
  if (objectiveId < 0) {
    return c.json({ error: "Invalid objective ID" }, 400);
  }

  const gameAddress = parseAddress(c.req.query("game_address"));

  const conditions = [eq(objectives.objectiveId, objectiveId)];
  if (gameAddress) {
    conditions.push(eq(objectives.gameAddress, gameAddress));
  }

  const [match] = await db
    .select()
    .from(objectives)
    .where(and(...conditions))
    .limit(1);

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

export default app;
