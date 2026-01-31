import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { minters } from "../db/schema.js";

const app = new Hono();

// GET /minters - List all minters
app.get("/", async (c) => {
  const results = await db
    .select()
    .from(minters)
    .orderBy(desc(minters.createdAt));

  return c.json({
    data: results.map(serializeMinter),
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
