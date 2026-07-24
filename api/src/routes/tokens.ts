import { Hono } from "hono";
import { eq, desc, asc, and, sql, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { tokens, scoreHistory, minters, games } from "../db/schema.js";
import { parseTokenId, parseGameId, parseAddress, parseNonNegativeInt, parseOptionalNonNegativeInt } from "../utils/validation.js";
import {
  parseRankScope,
  parseRankScopeFromGetter,
  computeRank,
  computeRanksBulk,
} from "../utils/rank.js";

const MAX_BULK_RANK_TOKENS = 500;
// Cap for the by-ids fetch (POST /tokens/query). Matches the bulk-rank cap — a
// player's whole game set (e.g. every campaign-minted beast) in one request.
const MAX_TOKENS_BY_IDS = 500;

// Sort field name (API short form) → column. Shared by GET / and POST /query.
const SORT_FIELDS: Record<string, any> = {
  score: tokens.currentScore,
  minted: tokens.mintedAt,
  updated: tokens.lastUpdatedAt,
  completedAt: tokens.completedAt,
  start: tokens.startDelay,
  end: tokens.endDelay,
  name: tokens.playerName,
};

const app = new Hono();

// In-memory minter cache (minter_id -> contract_address)
// Refreshed on first request and when a cache miss occurs
let minterCache = new Map<string, string>();
let minterCacheReady = false;

async function loadMinterCache() {
  const rows = await db.select({ minterId: minters.minterId, contractAddress: minters.contractAddress }).from(minters);
  minterCache = new Map(rows.map((r) => [r.minterId.toString(), r.contractAddress]));
  minterCacheReady = true;
}

// In-memory game cache (game_id -> contract_address)
let gameCache = new Map<number, string>();
let gameCacheReady = false;

async function loadGameCache() {
  const rows = await db.select({ gameId: games.gameId, contractAddress: games.contractAddress }).from(games);
  gameCache = new Map(rows.map((r) => [r.gameId, r.contractAddress]));
  gameCacheReady = true;
}

async function resolveGameAddress(gameId: number): Promise<string | null> {
  if (!gameCacheReady) await loadGameCache();
  const cached = gameCache.get(gameId);
  if (cached !== undefined) return cached;
  await loadGameCache();
  return gameCache.get(gameId) ?? null;
}

async function resolveMinterAddress(mintedBy: string): Promise<string | null> {
  if (!minterCacheReady) await loadMinterCache();
  const cached = minterCache.get(mintedBy);
  if (cached !== undefined) return cached;
  // Cache miss — refresh and retry once
  await loadMinterCache();
  return minterCache.get(mintedBy) ?? null;
}

async function resolveMinterId(address: string): Promise<bigint | null> {
  if (!minterCacheReady) await loadMinterCache();
  for (const [id, addr] of minterCache) {
    if (addr === address) return BigInt(id);
  }
  // Cache miss — refresh and retry once
  await loadMinterCache();
  for (const [id, addr] of minterCache) {
    if (addr === address) return BigInt(id);
  }
  return null;
}

// GET /tokens - List tokens (paginated, filterable)
app.get("/", async (c) => {
  const gameId = parseGameId(c.req.query("game_id"));
  const owner = parseAddress(c.req.query("owner"));
  const gameOver = c.req.query("game_over");
  const contextId = parseOptionalNonNegativeInt(c.req.query("context_id"));
  const hasContext = c.req.query("has_context");
  const contextName = c.req.query("context_name");
  const minterAddress = parseAddress(c.req.query("minter_address"));
  const sortBy = c.req.query("sort_by");
  const sortOrder = c.req.query("sort_order") === "asc" ? "asc" : "desc";
  const limit = parseNonNegativeInt(c.req.query("limit"), 50);
  // Cap matches budokan-api's `/tournaments/:id/registrations` cap so callers
  // that pair the two (e.g. budokan's claim-prizes dialog grouping refunds by
  // current token owner) get a consistent page size from both sides.
  const cappedLimit = Math.min(limit, 1000);
  const offset = parseNonNegativeInt(c.req.query("offset"), 0);

  const conditions = [];
  if (gameId !== null) conditions.push(eq(tokens.gameId, gameId));
  if (owner !== null) conditions.push(eq(tokens.ownerAddress, owner));
  if (gameOver === "true") conditions.push(eq(tokens.gameOver, true));
  if (gameOver === "false") conditions.push(eq(tokens.gameOver, false));
  if (contextId !== null) conditions.push(eq(tokens.contextId, contextId));
  if (hasContext === "true") conditions.push(eq(tokens.hasContext, true));
  if (hasContext === "false") conditions.push(eq(tokens.hasContext, false));
  if (contextName) conditions.push(eq(tokens.contextName, contextName));
  if (minterAddress) {
    const minterId = await resolveMinterId(minterAddress);
    if (minterId !== null) {
      conditions.push(eq(tokens.mintedBy, minterId));
    } else {
      // Minter not found — return empty
      return c.json({ data: [], total: 0, limit, offset: Math.max(offset, 0) });
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Resolve sort order
  const sortColumn = SORT_FIELDS[sortBy ?? ""] ?? tokens.lastUpdatedAt;
  const orderBy = sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(tokens)
      .where(where)
      .orderBy(orderBy, asc(tokens.mintedAt))
      .limit(cappedLimit)
      .offset(Math.max(offset, 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tokens)
      .where(where),
  ]);

  // Opt out of the ~40 KB tokenUri per row with ?include_uri=false. Default keeps
  // it (backward-compatible for existing callers / raw consumers).
  const includeUri = c.req.query("include_uri") !== "false";
  return c.json({
    data: await Promise.all(results.map(async (t) => ({
      ...serializeToken(t, includeUri),
      minterAddress: await resolveMinterAddress(t.mintedBy.toString()),
      gameAddress: await resolveGameAddress(t.gameId),
    }))),
    total: countResult[0]?.count ?? 0,
    limit,
    offset: Math.max(offset, 0),
  });
});

// POST /tokens/query - List tokens filtered to an explicit tokenIds set.
//
// Same shape as GET /tokens (data/total/limit/offset + the same optional
// gameId/owner/gameOver/minterAddress filters and sort), but scoped to the
// provided ids. POST (not a GET ?token_ids=) because the id list can be hundreds
// of felt252 values — URL-length limits in proxies/CDNs would bite (same reason
// as POST /tokens/rank). This is the by-ids fetch behind the SDK's
// `getTokens({ tokenIds })` / `useTokens({ tokenIds })`.
app.post("/query", async (c) => {
  type Body = {
    tokenIds?: unknown;
    gameId?: unknown;
    owner?: unknown;
    gameOver?: unknown;
    minterAddress?: unknown;
    hasContext?: unknown;
    contextId?: unknown;
    contextName?: unknown;
    sort?: { field?: unknown; direction?: unknown };
    limit?: unknown;
    offset?: unknown;
    includeUri?: unknown;
  };

  let body: Body;
  try {
    body = await c.req.json<Body>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!Array.isArray(body.tokenIds)) {
    return c.json({ error: "tokenIds must be an array" }, 400);
  }
  const offset = parseNonNegativeInt(
    body.offset != null ? String(body.offset) : undefined,
    0,
  );
  if (body.tokenIds.length === 0) {
    return c.json({ data: [], total: 0, limit: 0, offset });
  }
  if (body.tokenIds.length > MAX_TOKENS_BY_IDS) {
    return c.json(
      { error: `Too many tokenIds (max ${MAX_TOKENS_BY_IDS})` },
      400,
    );
  }

  const ids: string[] = [];
  for (const raw of body.tokenIds) {
    const id = parseTokenId(typeof raw === "string" ? raw : String(raw));
    if (id === null) {
      return c.json({ error: `Invalid tokenId: ${raw}` }, 400);
    }
    ids.push(id);
  }

  const conditions = [inArray(tokens.tokenId, ids)];
  const gameId = parseGameId(
    body.gameId != null ? String(body.gameId) : undefined,
  );
  if (gameId !== null) conditions.push(eq(tokens.gameId, gameId));
  const owner = parseAddress(body.owner != null ? String(body.owner) : undefined);
  if (owner !== null) conditions.push(eq(tokens.ownerAddress, owner));
  if (body.gameOver === true) conditions.push(eq(tokens.gameOver, true));
  if (body.gameOver === false) conditions.push(eq(tokens.gameOver, false));
  // Context filters — parity with the GET /tokens path.
  if (body.hasContext === true) conditions.push(eq(tokens.hasContext, true));
  if (body.hasContext === false) conditions.push(eq(tokens.hasContext, false));
  const contextId = parseOptionalNonNegativeInt(
    body.contextId != null ? String(body.contextId) : undefined,
  );
  if (contextId !== null) conditions.push(eq(tokens.contextId, contextId));
  if (typeof body.contextName === "string" && body.contextName) {
    conditions.push(eq(tokens.contextName, body.contextName));
  }
  const minterAddress = parseAddress(
    body.minterAddress != null ? String(body.minterAddress) : undefined,
  );
  if (minterAddress) {
    const minterId = await resolveMinterId(minterAddress);
    if (minterId === null) {
      return c.json({ data: [], total: 0, limit: ids.length, offset });
    }
    conditions.push(eq(tokens.mintedBy, minterId));
  }

  const where = and(...conditions);
  const sortBy = typeof body.sort?.field === "string" ? body.sort.field : undefined;
  const sortOrder = body.sort?.direction === "asc" ? "asc" : "desc";
  const sortColumn = SORT_FIELDS[sortBy ?? ""] ?? tokens.lastUpdatedAt;
  const orderBy = sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);
  const cappedLimit = Math.min(
    parseNonNegativeInt(
      body.limit != null ? String(body.limit) : undefined,
      ids.length,
    ),
    1000,
  );

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(tokens)
      .where(where)
      .orderBy(orderBy, asc(tokens.mintedAt))
      .limit(cappedLimit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tokens)
      .where(where),
  ]);

  // Opt out of the ~40 KB tokenUri per row with { includeUri: false } — this is the
  // SDK's by-ids fetch path (the beast-achievements poller), where it dominates egress.
  const includeUri = body.includeUri !== false;
  return c.json({
    data: await Promise.all(
      results.map(async (t) => ({
        ...serializeToken(t, includeUri),
        minterAddress: await resolveMinterAddress(t.mintedBy.toString()),
        gameAddress: await resolveGameAddress(t.gameId),
      })),
    ),
    total: countResult[0]?.count ?? 0,
    limit: cappedLimit,
    offset,
  });
});

// GET /tokens/:id - Single token
app.get("/:id", async (c) => {
  const tokenId = parseTokenId(c.req.param("id"));
  if (tokenId === null) {
    return c.json({ error: "Invalid token ID" }, 400);
  }

  const result = await db
    .select()
    .from(tokens)
    .where(eq(tokens.tokenId, tokenId))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Token not found" }, 404);
  }

  return c.json({
    data: {
      ...serializeToken(result[0]),
      minterAddress: await resolveMinterAddress(result[0].mintedBy.toString()),
      gameAddress: await resolveGameAddress(result[0].gameId),
    },
  });
});

// POST /tokens/rank - Bulk rank lookup
//
// Body: { tokenIds: string[], ...scope }
// Scope keys mirror the GET /:id/rank query params (gameId, settingsId,
// objectiveId, contextId, contextName, owner, minterAddress, gameOver,
// minScore, maxScore).
//
// Returns ranks for the requested tokenIds that exist in scope; ids missing
// from scope are echoed in `notFound`. Capped at MAX_BULK_RANK_TOKENS.
//
// POST instead of GET because the tokenIds list can be hundreds of felt252
// values; URL-length limits in proxies/CDNs would bite for typical
// Budokan-scale player profiles.
app.post("/rank", async (c) => {
  type Body = {
    tokenIds?: unknown;
    gameId?: unknown;
    settingsId?: unknown;
    objectiveId?: unknown;
    contextId?: unknown;
    contextName?: unknown;
    owner?: unknown;
    minterAddress?: unknown;
    gameOver?: unknown;
    minScore?: unknown;
    maxScore?: unknown;
  };

  let body: Body;
  try {
    body = await c.req.json<Body>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!Array.isArray(body.tokenIds)) {
    return c.json({ error: "tokenIds must be an array" }, 400);
  }
  if (body.tokenIds.length === 0) {
    return c.json({ data: [], notFound: [] });
  }
  if (body.tokenIds.length > MAX_BULK_RANK_TOKENS) {
    return c.json(
      { error: `Too many tokenIds (max ${MAX_BULK_RANK_TOKENS})` },
      400,
    );
  }

  const requested: string[] = [];
  for (const raw of body.tokenIds) {
    const id = parseTokenId(typeof raw === "string" ? raw : String(raw));
    if (id === null) {
      return c.json({ error: `Invalid tokenId: ${raw}` }, 400);
    }
    requested.push(id);
  }

  // Body uses camelCase (matches our SDK types); parseRankScopeFromGetter
  // expects snake_case keys (matches the GET query-string convention). The
  // tiny adapter keeps both endpoints sharing a single scope-parsing impl.
  const get = (key: string): string | undefined => {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const v = (body as Record<string, unknown>)[camel];
    if (v === undefined || v === null) return undefined;
    return String(v);
  };
  const scope = await parseRankScopeFromGetter(get, { includeOwner: true });
  if (scope.error) return c.json(scope.error.body, scope.error.status);

  const ranks = await computeRanksBulk(scope.conditions, requested);
  const foundIds = new Set(ranks.map((r) => r.tokenId));
  const notFound = requested.filter((id) => !foundIds.has(id));

  return c.json({
    data: ranks,
    notFound,
  });
});

// GET /tokens/:id/rank - Rank of a token within an optional scope
app.get("/:id/rank", async (c) => {
  const tokenId = parseTokenId(c.req.param("id"));
  if (tokenId === null) {
    return c.json({ error: "Invalid token ID" }, 400);
  }

  const scope = await parseRankScope(c, { includeOwner: true });
  if (scope.error) return c.json(scope.error.body, scope.error.status);

  const [target] = await db
    .select({ score: tokens.currentScore, mintedAt: tokens.mintedAt })
    .from(tokens)
    .where(and(eq(tokens.tokenId, tokenId), ...scope.conditions))
    .limit(1);

  if (!target) {
    return c.json({ error: "Token not found in scope" }, 404);
  }

  const { rank, total } = await computeRank(scope.conditions, target);

  return c.json({
    data: {
      tokenId,
      rank,
      total,
      score: target.score.toString(),
    },
  });
});

// GET /tokens/:id/scores - Score history for a token
app.get("/:id/scores", async (c) => {
  const tokenId = parseTokenId(c.req.param("id"));
  if (tokenId === null) {
    return c.json({ error: "Invalid token ID" }, 400);
  }

  const limit = parseNonNegativeInt(c.req.query("limit"), 100);

  const results = await db
    .select()
    .from(scoreHistory)
    .where(eq(scoreHistory.tokenId, tokenId))
    .orderBy(desc(scoreHistory.blockNumber))
    .limit(Math.min(limit, 500));

  return c.json({
    data: results.map((r) => ({
      ...r,
      tokenId: r.tokenId.toString(),
      score: r.score.toString(),
      blockNumber: r.blockNumber.toString(),
    })),
  });
});

function serializeToken(t: typeof tokens.$inferSelect, includeUri = true) {
  // tokenUriFetched / metadataUpdateBlock are internal fetcher bookkeeping and
  // not part of the public payload. metadataUpdateBlock in particular is a
  // bigint that would otherwise break JSON.stringify here.
  //
  // `tokenUri` is the ~40 KB embedded data-URI (base64 SVG). Most list/batch
  // consumers only need tokenId/score, so callers can opt out with
  // include_uri=false — the difference is ~40 KB/token vs ~100 B, i.e. the whole
  // beast-achievements poller egress spike. Gated (with its two fetch-status
  // companions) so an unqualified request stays backward-compatible.
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
