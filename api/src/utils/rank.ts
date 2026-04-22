import type { Context } from "hono";
import { eq, and, or, gt, lt, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { tokens, minters } from "../db/schema.js";
import {
  parseGameId,
  parseAddress,
  parseOptionalNonNegativeInt,
} from "./validation.js";

/**
 * Scope filters shared by rank endpoints. Each is optional and narrows the
 * leaderboard universe.
 */
export interface RankScope {
  conditions: SQL[];
  error?: { status: 400 | 404; body: { error: string } };
}

let minterCache = new Map<string, bigint>();
let minterCacheReady = false;

async function loadMinterCache() {
  const rows = await db
    .select({ minterId: minters.minterId, contractAddress: minters.contractAddress })
    .from(minters);
  minterCache = new Map(rows.map((r) => [r.contractAddress, BigInt(r.minterId.toString())]));
  minterCacheReady = true;
}

async function resolveMinterId(address: string): Promise<bigint | null> {
  if (!minterCacheReady) await loadMinterCache();
  const cached = minterCache.get(address);
  if (cached !== undefined) return cached;
  await loadMinterCache();
  return minterCache.get(address) ?? null;
}

/**
 * Parse scope-filter query params into an array of drizzle `SQL` conditions.
 *
 * `includeOwner` controls whether `owner` is treated as a scope filter. The
 * token rank endpoint includes it (rank *within* a single owner's tokens is
 * a valid scope); the player-rank endpoint excludes it since the address is
 * already the path parameter.
 */
export async function parseRankScope(
  c: Context,
  opts: { includeOwner: boolean },
): Promise<RankScope> {
  const gameId = parseGameId(c.req.query("game_id"));
  const settingsId = parseOptionalNonNegativeInt(c.req.query("settings_id"));
  const objectiveId = parseOptionalNonNegativeInt(c.req.query("objective_id"));
  const contextId = parseOptionalNonNegativeInt(c.req.query("context_id"));
  const contextName = c.req.query("context_name");
  const gameOver = c.req.query("game_over");
  const minterAddress = parseAddress(c.req.query("minter_address"));
  const owner = opts.includeOwner ? parseAddress(c.req.query("owner")) : null;
  const minScoreRaw = c.req.query("min_score");
  const maxScoreRaw = c.req.query("max_score");

  let minScore: bigint | null = null;
  let maxScore: bigint | null = null;
  try {
    if (minScoreRaw !== undefined) minScore = BigInt(minScoreRaw);
    if (maxScoreRaw !== undefined) maxScore = BigInt(maxScoreRaw);
  } catch {
    return { conditions: [], error: { status: 400, body: { error: "Invalid score bounds" } } };
  }

  const conditions: SQL[] = [];
  if (gameId !== null) conditions.push(eq(tokens.gameId, gameId));
  if (settingsId !== null) conditions.push(eq(tokens.settingsId, settingsId));
  if (objectiveId !== null) conditions.push(eq(tokens.objectiveId, objectiveId));
  if (contextId !== null) conditions.push(eq(tokens.contextId, contextId));
  if (contextName) conditions.push(eq(tokens.contextName, contextName));
  if (gameOver === "true") conditions.push(eq(tokens.gameOver, true));
  if (gameOver === "false") conditions.push(eq(tokens.gameOver, false));
  if (owner) conditions.push(eq(tokens.ownerAddress, owner));
  if (minScore !== null) conditions.push(sql`${tokens.currentScore} >= ${minScore}`);
  if (maxScore !== null) conditions.push(sql`${tokens.currentScore} <= ${maxScore}`);
  if (minterAddress) {
    const minterId = await resolveMinterId(minterAddress);
    if (minterId === null) {
      return { conditions: [], error: { status: 404, body: { error: "Minter not found" } } };
    }
    conditions.push(eq(tokens.mintedBy, minterId));
  }

  return { conditions };
}

/**
 * Given a target token (score + mintedAt) and a scope, return the 1-indexed
 * rank and total count. Rank = 1 + count of scope tokens that outrank the
 * target (strictly higher score, or equal score with earlier mintedAt).
 */
export async function computeRank(
  scopeConditions: SQL[],
  target: { score: bigint; mintedAt: Date },
): Promise<{ rank: number; total: number }> {
  const betterConditions = [
    ...scopeConditions,
    or(
      gt(tokens.currentScore, target.score),
      and(
        eq(tokens.currentScore, target.score),
        lt(tokens.mintedAt, target.mintedAt),
      ),
    ),
  ];

  const [betterResult, totalResult] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tokens)
      .where(and(...betterConditions)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tokens)
      .where(scopeConditions.length > 0 ? and(...scopeConditions) : undefined),
  ]);

  return {
    rank: (betterResult[0]?.count ?? 0) + 1,
    total: totalResult[0]?.count ?? 0,
  };
}
