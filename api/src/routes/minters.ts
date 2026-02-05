import { Hono } from "hono";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { minters } from "../db/schema.js";
import { parsePositiveInt } from "../utils/validation.js";

const app = new Hono();

// GET /minters - List all minters (paginated)
app.get("/", async (c) => {
  const limit = parsePositiveInt(c.req.query("limit"), 50);
  const offset = parsePositiveInt(c.req.query("offset"), 0);

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(minters)
      .orderBy(desc(minters.createdAt))
      .limit(Math.min(limit, 100))
      .offset(Math.max(offset, 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(minters),
  ]);

  return c.json({
    data: results.map(serializeMinter),
    total: countResult[0]?.count ?? 0,
    limit,
    offset: Math.max(offset, 0),
  });
});

// GET /minters/:minterId - Single minter detail
app.get("/:minterId", async (c) => {
  const raw = c.req.param("minterId");
  let minterId: bigint;
  try {
    minterId = BigInt(raw);
    if (minterId < 0n) {
      return c.json({ error: "Invalid minter ID" }, 400);
    }
  } catch {
    return c.json({ error: "Invalid minter ID" }, 400);
  }

  const result = await db
    .select()
    .from(minters)
    .where(eq(minters.minterId, minterId))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Minter not found" }, 404);
  }

  return c.json({ data: serializeMinter(result[0]) });
});

function serializeMinter(m: typeof minters.$inferSelect) {
  return {
    ...m,
    minterId: m.minterId.toString(),
    blockNumber: m.blockNumber.toString(),
  };
}

export default app;
