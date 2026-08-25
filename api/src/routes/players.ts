import { Hono } from "hono";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { tokens, minters, games } from "../db/schema.js";
import { parseAddress, parseGameId, parseNonNegativeInt } from "../utils/validation.js";
import { parseRankScope, computeRank } from "../utils/rank.js";
import { resolveUriAccess } from "../utils/uriAccess.js";
import { gameAddressCondition } from "../utils/gameScope.js";

/**
 * In-memory minter cache, keyed `<token contract>:<minter id>`.
 *
 * Minter ids come from per-contract storage upstream, so every self-bound
 * game hands out minter_id 1 to its own first minter. The id alone would
 * resolve to whichever contract's minter happened to be cached last.
 */
let minterCache = new Map<string, string>();
let minterCacheReady = false;

const minterKey = (tokenContract: string | null, minterId: bigint | string) =>
  `${tokenContract ?? ""}:${minterId.toString()}`;

async function loadMinterCache() {
  const rows = await db
    .select({
      minterId: minters.minterId,
      tokenContractAddress: minters.tokenContractAddress,
      contractAddress: minters.contractAddress,
    })
    .from(minters);
  minterCache = new Map(
    rows.map((r) => [minterKey(r.tokenContractAddress, r.minterId), r.contractAddress])
  );
  minterCacheReady = true;
}

async function resolveMinterAddress(
  tokenContract: string | null,
  mintedBy: string
): Promise<string | null> {
  const key = minterKey(tokenContract, mintedBy);
  if (!minterCacheReady) await loadMinterCache();
  const cached = minterCache.get(key);
  if (cached !== undefined) return cached;
  await loadMinterCache();
  return minterCache.get(key) ?? null;
}

// In-memory game cache (game_id -> contract_address)
let gameCache = new Map<number, string>();
let gameCacheReady = false;

async function loadGameCache() {
  const rows = await db.select({ gameId: games.gameId, contractAddress: games.contractAddress }).from(games);
  gameCache = new Map(rows.map((r) => [r.gameId, r.contractAddress]));
  gameCacheReady = true;
}

/**
 * The contract address of the game a token belongs to.
 *
 * Legacy tokens carry a numeric game_id that resolves through the registry
 * cache. Self-bound tokens have no game_id at all — the game IS the contract
 * that minted them — so the address is already on the row and no lookup
 * exists to do.
 */
async function resolveGameAddress(
  gameId: number | null,
  contractAddress?: string | null,
): Promise<string | null> {
  if (gameId === null) return contractAddress ?? null;
  if (!gameCacheReady) await loadGameCache();
  const cached = gameCache.get(gameId);
  if (cached !== undefined) return cached;
  await loadGameCache();
  return gameCache.get(gameId) ?? null;
}

const app = new Hono();

// GET /players/:address/tokens - Player's tokens with filtering
app.get("/:address/tokens", async (c) => {
  const address = parseAddress(c.req.param("address"));
  if (address === null) {
    return c.json({ error: "Invalid address" }, 400);
  }

  const gameId = parseGameId(c.req.query("game_id"));
  const gameAddress = parseAddress(c.req.query("game_address"));
  const gameOver = c.req.query("game_over");
  const sortBy = c.req.query("sort_by");
  const sortOrder = c.req.query("sort_order") === "asc" ? "asc" : "desc";
  const limit = parseNonNegativeInt(c.req.query("limit"), 50);
  const offset = parseNonNegativeInt(c.req.query("offset"), 0);

  const conditions = [eq(tokens.ownerAddress, address)];
  if (gameId !== null) conditions.push(eq(tokens.gameId, gameId));
  // Both generations — see utils/gameScope.ts.
  if (gameAddress !== null) conditions.push(await gameAddressCondition(gameAddress));
  if (gameOver === "true") conditions.push(eq(tokens.gameOver, true));
  if (gameOver === "false") conditions.push(eq(tokens.gameOver, false));

  const where = and(...conditions);

  const sortFields: Record<string, any> = {
    score: tokens.currentScore,
    minted: tokens.mintedAt,
    updated: tokens.lastUpdatedAt,
    start: tokens.startDelay,
    end: tokens.endDelay,
    name: tokens.playerName,
  };
  const sortColumn = sortFields[sortBy ?? ""] ?? tokens.lastUpdatedAt;
  const orderBy = sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(tokens)
      .where(where)
      .orderBy(orderBy, asc(tokens.mintedAt))
      .limit(Math.min(limit, 100))
      .offset(Math.max(offset, 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tokens)
      .where(where),
  ]);

  // A portfolio is a list, so it follows the same opt-in rule as GET /tokens:
  // ask with ?include_uri=true from an allowlisted origin. See utils/uriAccess.ts.
  const includeUri = resolveUriAccess(c, c.req.query("include_uri") === "true");

  return c.json({
    data: await Promise.all(results.map(async (t) => ({
      ...serializeToken(t, includeUri),
      minterAddress: await resolveMinterAddress(t.contractAddress, t.mintedBy.toString()),
      gameAddress: await resolveGameAddress(t.gameId, t.contractAddress),
    }))),
    total: countResult[0]?.count ?? 0,
    limit,
    offset: Math.max(offset, 0),
  });
});

// GET /players/:address/rank - Best-ranked token held by an address within scope
app.get("/:address/rank", async (c) => {
  const address = parseAddress(c.req.param("address"));
  if (address === null) {
    return c.json({ error: "Invalid address" }, 400);
  }

  // Scope applies to the leaderboard universe, not the player's holdings.
  // Owner is set via the path param and wired into the "best token" lookup
  // below, not into the global scope used for ranking comparisons.
  const scope = await parseRankScope(c, { includeOwner: false });
  if (scope.error) return c.json(scope.error.body, scope.error.status);

  // Find the player's top-ranked token in scope: highest score, earliest
  // mintedAt tie-break (matches computeRank's ordering).
  const [best] = await db
    .select({
      tokenId: tokens.tokenId,
      score: tokens.currentScore,
      mintedAt: tokens.mintedAt,
    })
    .from(tokens)
    .where(and(eq(tokens.ownerAddress, address), ...scope.conditions))
    .orderBy(desc(tokens.currentScore), asc(tokens.mintedAt))
    .limit(1);

  if (!best) {
    return c.json({ error: "No tokens found for player in scope" }, 404);
  }

  const { rank, total } = await computeRank(scope.conditions, {
    score: best.score,
    mintedAt: best.mintedAt,
  });

  return c.json({
    data: {
      tokenId: best.tokenId.toString(),
      rank,
      total,
      score: best.score.toString(),
    },
  });
});

// GET /players/:address/stats - Aggregated player statistics
app.get("/:address/stats", async (c) => {
  const address = parseAddress(c.req.param("address"));
  if (address === null) {
    return c.json({ error: "Invalid address" }, 400);
  }

  const result = await db
    .select({
      totalTokens: sql<number>`count(*)::int`,
      // A game's identity differs by generation: a legacy token names it with
      // game_id, a self-bound one IS its contract. Counting distinct game_id
      // alone reports 0 games played for a player who only holds self-bound
      // tokens, since every one of those rows has game_id null.
      gamesPlayed: sql<number>`count(DISTINCT CASE
        WHEN ${tokens.gameId} IS NOT NULL THEN 'legacy:' || ${tokens.gameId}
        ELSE 'standard:' || ${tokens.contractAddress}
      END)::int`,
      completedGames: sql<number>`count(*) filter (where ${tokens.gameOver} = true)::int`,
      activeGames: sql<number>`count(*) filter (where ${tokens.gameOver} = false)::int`,
      totalScore: sql<string>`coalesce(sum(${tokens.currentScore}), 0)`,
    })
    .from(tokens)
    .where(eq(tokens.ownerAddress, address));

  const stats = result[0];

  return c.json({
    data: {
      address,
      totalTokens: stats?.totalTokens ?? 0,
      gamesPlayed: stats?.gamesPlayed ?? 0,
      completedGames: stats?.completedGames ?? 0,
      activeGames: stats?.activeGames ?? 0,
      totalScore: (stats?.totalScore ?? "0").toString(),
    },
  });
});

function serializeToken(t: typeof tokens.$inferSelect, includeUri = false) {
  // tokenUriFetched / metadataUpdateBlock are internal fetcher bookkeeping and
  // not part of the public payload. metadataUpdateBlock in particular is a
  // bigint that would otherwise break JSON.stringify here.
  //
  // tokenUri is the ~40 KB base64 SVG — same opt-in treatment as the /tokens
  // list endpoints, since a portfolio page is exactly the case where returning
  // it unconditionally is most expensive.
  const {
    tokenUriFetched,
    metadataUpdateBlock,
    tokenUri,
    tokenUriFetchFailed,
    tokenUriFetchLastError,
    ...rest
  } = t;
  const base = {
    ...rest,
    tokenId: rest.tokenId.toString(),
    mintedBy: rest.mintedBy.toString(),
    currentScore: rest.currentScore.toString(),
    createdAtBlock: rest.createdAtBlock.toString(),
    lastUpdatedBlock: rest.lastUpdatedBlock.toString(),
  };
  return includeUri
    ? { ...base, tokenUri, tokenUriFetchFailed, tokenUriFetchLastError }
    : base;
}

export default app;
