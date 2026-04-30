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
  return parseRankScopeFromGetter(
    (key) => c.req.query(key),
    opts,
  );
}

/**
 * Same as `parseRankScope` but reads scope filters via an arbitrary getter.
 * Used by the bulk-rank POST route, where the filters arrive in the JSON
 * body rather than the query string.
 */
export async function parseRankScopeFromGetter(
  get: (key: string) => string | undefined,
  opts: { includeOwner: boolean },
): Promise<RankScope> {
  const gameId = parseGameId(get("game_id"));
  const settingsId = parseOptionalNonNegativeInt(get("settings_id"));
  const objectiveId = parseOptionalNonNegativeInt(get("objective_id"));
  const contextId = parseOptionalNonNegativeInt(get("context_id"));
  const contextName = get("context_name");
  const gameOver = get("game_over");
  const minterAddress = parseAddress(get("minter_address"));
  const owner = opts.includeOwner ? parseAddress(get("owner")) : null;
  const minScoreRaw = get("min_score");
  const maxScoreRaw = get("max_score");

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

export interface BulkRankEntry {
  tokenId: string;
  rank: number;
  total: number;
  score: string;
}

/**
 * Bulk-compute ranks for many tokens within the same scope. Single SQL pass
 * using a window function — server-side cost is roughly the same as one
 * single-token call regardless of how many tokenIds you ask for, because the
 * scope query is the dominant cost.
 *
 * Tie-break (`ORDER BY current_score DESC, minted_at ASC`) matches
 * `computeRank` exactly, so single-rank and bulk-rank return identical numbers
 * for the same (token, scope) pair.
 *
 * Returns an entry per requested tokenId that exists in scope. tokenIds not
 * found in scope are excluded — callers can compute the diff to surface them.
 */
export async function computeRanksBulk(
  scopeConditions: SQL[],
  tokenIds: string[],
): Promise<BulkRankEntry[]> {
  if (tokenIds.length === 0) return [];

  const scopeWhere =
    scopeConditions.length > 0 ? sql`WHERE ${and(...scopeConditions)}` : sql``;

  // We materialize ranks for every row in scope, then filter to the requested
  // ids. For typical Budokan tournament sizes (hundreds to low thousands of
  // entries) this is a single index scan + sort and stays well under 100ms.
  const result = await db.execute<{
    token_id: string;
    rank: number;
    total: number;
    score: string;
  }>(sql`
    WITH ranked AS (
      SELECT
        ${tokens.tokenId}        AS token_id,
        ${tokens.currentScore}   AS score,
        ROW_NUMBER() OVER (
          ORDER BY ${tokens.currentScore} DESC, ${tokens.mintedAt} ASC
        )                        AS rank,
        COUNT(*) OVER ()         AS total
      FROM ${tokens}
      ${scopeWhere}
    )
    SELECT token_id, rank::int AS rank, total::int AS total, score::text AS score
    FROM ranked
    WHERE token_id = ANY(${tokenIds})
  `);

  return result.rows.map((r) => ({
    tokenId: r.token_id,
    rank: r.rank,
    total: r.total,
    score: r.score,
  }));
}
