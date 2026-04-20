import { Hono } from "hono";
import { eq, desc, asc, and, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { tokens, scoreHistory, minters, games } from "../db/schema.js";
import { parseTokenId, parseGameId, parseAddress, parseNonNegativeInt, parseOptionalNonNegativeInt } from "../utils/validation.js";

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
      .orderBy(orderBy, asc(tokens.tokenId))
      .limit(Math.min(limit, 100))
      .offset(Math.max(offset, 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tokens)
      .where(where),
  ]);

  return c.json({
    data: await Promise.all(results.map(async (t) => ({
      ...serializeToken(t),
      minterAddress: await resolveMinterAddress(t.mintedBy.toString()),
      gameAddress: await resolveGameAddress(t.gameId),
    }))),
    total: countResult[0]?.count ?? 0,
    limit,
    offset: Math.max(offset, 0),
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

function serializeToken(t: typeof tokens.$inferSelect) {
  const { tokenUriFetched, ...rest } = t;
  return {
    ...rest,
    tokenId: rest.tokenId.toString(),
    mintedBy: rest.mintedBy.toString(),
    currentScore: rest.currentScore.toString(),
    createdAtBlock: rest.createdAtBlock.toString(),
    lastUpdatedBlock: rest.lastUpdatedBlock.toString(),
  };
}

export default app;
