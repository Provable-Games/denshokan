import { Hono } from "hono";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { db } from "../db/client.js";
import { tokens, minters } from "../db/schema.js";
import { parseAddress, parseNonNegativeInt } from "../utils/validation.js";

// Schema-1 mint block occupies bits 32..63. Numeric arithmetic preserves all
// felt252 bits; PostgreSQL bigint casts would overflow for full token IDs.
const mintBlock = sql<number>`floor(mod(${tokens.tokenId}, 18446744073709551616::numeric) / 4294967296::numeric)::bigint`;

/** GameCore ordering is applied by PostgreSQL BEFORE limit/offset. */
export function createLeaderboardRouter(database: typeof db) {
  const app = new Hono();
  app.get("/", async (c) => {
    const gameAddress = parseAddress(c.req.query("game_address"));
    const minterAddress = parseAddress(c.req.query("minter_address"));
    const contextId = c.req.query("context_id");
    if (!gameAddress || !minterAddress || !contextId || !/^\d+$/.test(contextId)
      || BigInt(contextId) >= (1n << 56n)) {
      return c.json({ error: "Valid game_address, minter_address and context_id are required" }, 400);
    }
    const direction = c.req.query("sort_order") === "asc" ? "asc" : "desc";
    const limit = Math.min(parseNonNegativeInt(c.req.query("limit"), 50), 1000);
    const offset = parseNonNegativeInt(c.req.query("offset"), 0);
    const where = and(
      eq(tokens.contractAddress, gameAddress),
      eq(minters.contractAddress, minterAddress),
      sql`${tokens.contextId} = ${contextId}::numeric`,
      gt(tokens.currentScore, 0n),
    );
    // Minter IDs belong to their issuing game, so join on BOTH fields.
    const join = and(
      eq(tokens.mintedBy, minters.minterId),
      eq(tokens.contractAddress, minters.tokenContractAddress),
    );
    const [rows, counts] = await Promise.all([
      database.select({
        tokenId: tokens.tokenId,
        score: tokens.currentScore,
        owner: tokens.ownerAddress,
        mintBlock,
      }).from(tokens).innerJoin(minters, join).where(where)
        .orderBy(direction === "asc" ? asc(tokens.currentScore) : desc(tokens.currentScore),
          asc(mintBlock), asc(tokens.tokenId))
        .limit(limit).offset(offset),
      database.select({ count: sql<number>`count(*)::int` })
        .from(tokens).innerJoin(minters, join).where(where),
    ]);
    return c.json({
      data: rows.map((row) => ({
        ...row,
        tokenId: row.tokenId.toString(),
        score: row.score.toString(),
        mintBlock: Number(row.mintBlock), // u32, always exactly representable
      })),
      total: counts[0]?.count ?? 0,
      limit,
      offset,
    });
  });
  return app;
}
