import { Hono } from "hono";
import { eq, desc, asc, and, or, sql, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { tokens, minters, games } from "../db/schema.js";
import { parseTokenId, parseGameId, parseAddress, parseNonNegativeInt, parseOptionalNonNegativeInt } from "../utils/validation.js";
import {
  parseRankScope,
  parseRankScopeFromGetter,
  computeRank,
  computeRanksBulk,
} from "../utils/rank.js";
import { resolveUriAccess } from "../utils/uriAccess.js";
import { gameAddressCondition } from "../utils/gameScope.js";

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

/**
 * In-memory minter cache, keyed `<token contract>:<minter id>`.
 *
 * The token contract is part of the key because `minter_counter` is
 * per-contract storage upstream: every self-bound game assigns minter_id 1 to
 * its own first minter, so an id alone resolves to the wrong address as soon
 * as a second token contract is indexed.
 *
 * Refreshed on first request and when a cache miss occurs.
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
  // Cache miss — refresh and retry once
  await loadMinterCache();
  return minterCache.get(key) ?? null;
}

/**
 * Every (token contract, minter id) pair a minter address was registered under.
 *
 * A list rather than one id: the same minter can be registered by several
 * token contracts and receive a *different* id from each, so filtering tokens
 * by minter address means matching any of those pairs — never an id alone,
 * which would sweep in other contracts' tokens that happen to share it.
 */
async function resolveMinterScopes(
  address: string
): Promise<Array<{ tokenContract: string; minterId: bigint }>> {
  const collect = () => {
    const found: Array<{ tokenContract: string; minterId: bigint }> = [];
    for (const [key, addr] of minterCache) {
      if (addr !== address) continue;
      const sep = key.lastIndexOf(":");
      found.push({
        tokenContract: key.slice(0, sep),
        minterId: BigInt(key.slice(sep + 1)),
      });
    }
    return found;
  };

  if (!minterCacheReady) await loadMinterCache();
  const hit = collect();
  if (hit.length > 0) return hit;
  // Cache miss — refresh and retry once
  await loadMinterCache();
  return collect();
}

/**
 * Conditions selecting a token by id, optionally narrowed to one contract.
 *
 * Identity is (contract_address, token_id): an id is unique only within the
 * ERC721 that issued it, and standard ids carry nothing that separates one
 * game from another. Callers that know the contract should say so; callers
 * that don't get an explicit ambiguity error instead of an arbitrary row.
 */
function byIdConditions(tokenId: string, contractAddress: string | null) {
  return contractAddress === null
    ? eq(tokens.tokenId, tokenId)
    : and(eq(tokens.tokenId, tokenId), eq(tokens.contractAddress, contractAddress))!;
}

// GET /tokens - List tokens (paginated, filterable)
app.get("/", async (c) => {
  const gameAddress = parseAddress(c.req.query("game_address"));
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
  if (gameAddress !== null) conditions.push(gameAddressCondition(gameAddress));
  if (owner !== null) conditions.push(eq(tokens.ownerAddress, owner));
  if (gameOver === "true") conditions.push(eq(tokens.gameOver, true));
  if (gameOver === "false") conditions.push(eq(tokens.gameOver, false));
  if (contextId !== null) conditions.push(eq(tokens.contextId, contextId));
  if (hasContext === "true") conditions.push(eq(tokens.hasContext, true));
  if (hasContext === "false") conditions.push(eq(tokens.hasContext, false));
  if (contextName) conditions.push(eq(tokens.contextName, contextName));
  if (minterAddress) {
    const scopes = await resolveMinterScopes(minterAddress);
    if (scopes.length > 0) {
      // Match the minter id only within the contract that issued it — the
      // same id means a different minter in another contract.
      conditions.push(
        or(
          ...scopes.map((s) =>
            and(eq(tokens.contractAddress, s.tokenContract), eq(tokens.mintedBy, s.minterId))
          )
        )!
      );
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

  // The ~40 KB tokenUri per row is opt-in on list endpoints: ask for it with
  // ?include_uri=true, from an origin in URI_ALLOWED_ORIGINS. A page of 1000
  // tokens is ~100 KB without it and ~40 MB with it, which is why the default
  // flipped — see utils/uriAccess.ts.
  const includeUri = resolveUriAccess(c, c.req.query("include_uri") === "true");
  return c.json({
    data: await Promise.all(results.map(async (t) => ({
      ...serializeToken(t, includeUri),
      minterAddress: await resolveMinterAddress(t.contractAddress, t.mintedBy.toString()),
      // The issuing contract IS the game.
      gameAddress: t.contractAddress,
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
    gameAddress?: unknown;
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
  const gameAddress = parseAddress(
    body.gameAddress != null ? String(body.gameAddress) : undefined,
  );
  if (gameAddress !== null) conditions.push(gameAddressCondition(gameAddress));
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
    const scopes = await resolveMinterScopes(minterAddress);
    if (scopes.length === 0) {
      return c.json({ data: [], total: 0, limit: ids.length, offset });
    }
    // Per-contract minter ids — see resolveMinterScopes.
    conditions.push(
      or(
        ...scopes.map((s) =>
          and(eq(tokens.contractAddress, s.tokenContract), eq(tokens.mintedBy, s.minterId))
        )
      )!
    );
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

  // Opt in to the ~40 KB tokenUri per row with { includeUri: true }, from an
  // origin in URI_ALLOWED_ORIGINS. This is the SDK's by-ids fetch path (the
  // beast-achievements poller) where it dominated egress, so it defaults off.
  const includeUri = resolveUriAccess(c, body.includeUri === true);
  return c.json({
    data: await Promise.all(
      results.map(async (t) => ({
        ...serializeToken(t, includeUri),
        minterAddress: await resolveMinterAddress(t.contractAddress, t.mintedBy.toString()),
        // The issuing contract IS the game.
      gameAddress: t.contractAddress,
      })),
    ),
    total: countResult[0]?.count ?? 0,
    limit: cappedLimit,
    offset,
  });
});

// GET /tokens/:id - Single token
//
// A token id identifies a row only together with its issuing contract, so an
// optional `?contract_address=` disambiguates. Without it a shared id is
// reported as ambiguous rather than silently resolved to an arbitrary row —
// see byIdConditions.
app.get("/:id", async (c) => {
  const tokenId = parseTokenId(c.req.param("id"));
  if (tokenId === null) {
    return c.json({ error: "Invalid token ID" }, 400);
  }
  const contractAddress = parseAddress(c.req.query("contract_address"));

  const result = await db
    .select()
    .from(tokens)
    .where(byIdConditions(tokenId, contractAddress))
    // Two, not one: a second row means the id is ambiguous and the caller has
    // to say which contract they meant.
    .limit(2);

  if (result.length === 0) {
    return c.json({ error: "Token not found" }, 404);
  }
  if (result.length > 1) {
    return c.json(
      {
        error:
          "Ambiguous token ID: more than one contract has issued this id. " +
          "Retry with ?contract_address=<address>.",
      },
      409,
    );
  }

  // Single token — one URI, not a page of them, so this stays opt-out
  // (?include_uri=false) to keep token-detail views working unchanged. The
  // origin allowlist still applies.
  const includeUri = resolveUriAccess(c, c.req.query("include_uri") !== "false");

  return c.json({
    data: {
      ...serializeToken(result[0], includeUri),
      minterAddress: await resolveMinterAddress(result[0].contractAddress, result[0].mintedBy.toString()),
      gameAddress: result[0].contractAddress,
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
    /** Scope to one game, by contract address. */
    gameAddress?: unknown;
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

  const contractAddress = parseAddress(c.req.query("contract_address"));
  const targets = await db
    .select({ score: tokens.currentScore, mintedAt: tokens.mintedAt })
    .from(tokens)
    .where(and(byIdConditions(tokenId, contractAddress), ...scope.conditions))
    // See GET /:id — a second row means the id alone is ambiguous. Ranking an
    // arbitrary one of them would return a confident, wrong number.
    .limit(2);

  if (targets.length > 1) {
    return c.json(
      {
        error:
          "Ambiguous token ID: more than one contract has issued this id. " +
          "Retry with ?contract_address=<address>, or narrow the scope.",
      },
      409,
    );
  }
  const target = targets[0];

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


function serializeToken(t: typeof tokens.$inferSelect, includeUri = true) {
  // tokenUriFetched / metadataUpdateBlock are internal fetcher bookkeeping and
  // not part of the public payload. metadataUpdateBlock in particular is a
  // bigint that would otherwise break JSON.stringify here.
  //
  // `tokenUri` is the ~40 KB embedded data-URI (base64 SVG) — vs ~100 B for the
  // rest of the row. Most list/batch consumers only need tokenId/score, so list
  // endpoints omit it unless a caller opts in AND its origin is allowlisted
  // (utils/uriAccess.ts). Callers decide via the `includeUri` argument; the two
  // fetch-status companions ride along with it.
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
    /**
     * Serialized explicitly, and as a STRING.
     *
     * The column widened from int4 to numeric for the standard layout's 65
     * bits, and node-postgres hands numeric back as a string to preserve
     * precision — so spreading `...rest` would have silently flipped this
     * field's JSON type from number to string for every row, legacy included.
     * Stating it here makes the string contract the deliberate one: 65 bits
     * does not survive a JS number, so a numeric type here would be lossy.
     */
    metadata: rest.metadata?.toString() ?? "0",
  };
  return includeUri
    ? { ...base, tokenUri, tokenUriFetchFailed, tokenUriFetchLastError }
    : base;
}

export default app;
