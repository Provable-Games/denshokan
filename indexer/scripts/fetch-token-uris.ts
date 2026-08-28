/**
 * Standalone token URI fetcher — runs separately from the indexer.
 *
 * Queries tokens with token_uri_fetched = false, fetches their URIs via RPC,
 * parses attributes (score, game_over, player_name, context_id, etc.),
 * and updates the database.
 *
 * This runs on its own event loop so RPC calls don't interfere with the
 * indexer's gRPC stream.
 *
 * Usage:
 *   npx tsx scripts/fetch-token-uris.ts                # one-shot
 *   npx tsx scripts/fetch-token-uris.ts --watch        # continuous polling
 *   npx tsx scripts/fetch-token-uris.ts --concurrency 5
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, sql, isNull } from "drizzle-orm";
import { Pool } from "pg";
import { RpcProvider, Contract, hash } from "starknet";
import { readFileSync } from "fs";
import { resolve } from "path";

import * as schema from "../src/lib/schema.js";
import { feltToString, parseTokenUriAttributes } from "../src/lib/decoder.js";

// ---------------------------------------------------------------------------
// Configuration (all from env vars, CLI args as fallback)
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArgValue(name: string, defaultVal: string): string {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

/** env > CLI arg > default */
function config(envKey: string, argName: string, defaultVal: string): string {
  return process.env[envKey] ?? getArgValue(argName, defaultVal);
}

const WATCH = process.env.URI_FETCHER_WATCH === "true" || args.includes("--watch");
const CONCURRENCY = parseInt(config("URI_FETCHER_CONCURRENCY", "--concurrency", "5"), 10);
const POLL_INTERVAL_MS = parseInt(config("URI_FETCHER_INTERVAL_MS", "--interval", "30000"), 10);
const MAX_RETRIES = parseInt(process.env.URI_FETCHER_MAX_RETRIES ?? "3", 10);
const RETRY_BASE_DELAY_MS = parseInt(process.env.URI_FETCHER_RETRY_DELAY_MS ?? "2000", 10);
const BATCH_DELAY_MS = parseInt(process.env.URI_FETCHER_BATCH_DELAY_MS ?? "500", 10);

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/denshokan";
const RPC_URL =
  process.env.RPC_URL ?? "https://rpc.provable.games/rpc";
const RPC_API_KEY = process.env.RPC_API_KEY ?? "";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool, { schema });

const provider = new RpcProvider({
  nodeUrl: RPC_URL,
  ...(RPC_API_KEY && { headers: { Authorization: `Bearer ${RPC_API_KEY}` } }),
});

const abi = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/lib/abi/denshokan.json"), "utf-8"),
);
/**
 * `token_uri` has to be called on the contract that ISSUED the token.
 *
 * The legacy denshokan was the only token contract, so a single instance
 * sufficed. A self-bound game is its own ERC721 and knows only its own
 * tokens — asking the denshokan for one of them fails, and the row would be
 * quarantined as a permanent fetch failure, leaving score, game_over and
 * player_name unset forever. That is the entire mutable-state pipeline for
 * the standard generation.
 *
 * The ABI is shared: a self-bound token exposes the same ERC721 + token_uri
 * surface, so only the address differs.
 */
const contracts = new Map<string, Contract>();
function contractFor(address: string): Contract {
  let c = contracts.get(address);
  if (!c) {
    c = new Contract({ abi, address, providerOrAccount: provider });
    contracts.set(address, c);
  }
  return c;
}

/** Convert bigint token ID to string for numeric column storage */
const toId = (id: bigint) => id.toString();

/**
 * Matches exactly one token row.
 *
 * Identity is (contract_address, token_id) — a token id is unique only within
 * its issuing ERC721. Updating by id alone could write one game's fetched
 * state onto another game's token.
 */
const tokenRow = (contractAddress: string, tokenId: bigint) =>
  and(
    eq(schema.tokens.contractAddress, contractAddress),
    eq(schema.tokens.tokenId, toId(tokenId)),
  );

// ---------------------------------------------------------------------------
// Fetch logic
// ---------------------------------------------------------------------------

async function fetchAndStore(
  contractAddress: string,
  tokenId: bigint,
  seenBlock: bigint,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const result = await contractFor(contractAddress).call("token_uri", [tokenId]);
    const uri = result.toString();

    const parsed = parseTokenUriAttributes(uri);

    const tokenUpdate: Record<string, unknown> = {
      tokenUri: uri,
      // Only mark the token clean if no newer MetadataUpdate landed while this
      // RPC call was in flight. `seenBlock` is the dirty marker read before the
      // fetch; if the indexer advanced metadata_update_block past it (a new
      // game-over/score update), this evaluates to false so the token stays in
      // the work queue and gets re-fetched against the fresher state. Without
      // this guard a pre-game-over fetch could land after the game-over reset
      // and pin game_over = false forever.
      tokenUriFetched: sql`${schema.tokens.metadataUpdateBlock} <= ${seenBlock}`,
      lastUpdatedAt: new Date(),
    };

    // The URI is PRESENTATION. Only the rendered blob itself is taken from it;
    // every field with a typed entrypoint is read from the game instead, by
    // the passes below. A trait a renderer forgets can then cost us artwork,
    // never data.
    //
    // `completed_at` is the one exception: it has no entrypoint in the
    // standard, so it still rides the document when a game reports it.
    //
    // This is the AUTHORITATIVE source and takes precedence — it is the
    // game's own record of when the run ended. `processTokenState` derives a
    // fallback from the MetadataUpdate block for the self-bound generation,
    // which reports completed_at as 0 unconditionally, and that fallback only
    // writes where this left null.
    if (parsed.completedAt !== null) tokenUpdate.completedAt = parsed.completedAt;

    await db
      .update(schema.tokens)
      .set(tokenUpdate)
      .where(tokenRow(contractAddress, tokenId));

    // Game identity from the typed entrypoint when the game exposes it,
    // falling back to the traits parsed out of this URI. A game whose renderer
    // omits "Game Name" would otherwise have no name anywhere — the same
    // omission that lost Context, one field over.
    // MERGED, not substituted: `upsertGame` also records client_url, renderer
    // and skills, which the typed surface does not carry. Replacing wholesale
    // would silently drop them.
    const declared = await tryGameMetadata(contractAddress);
    await upsertGame(contractAddress, declared ? { ...parsed, ...declared } : parsed);

    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(
      `[URI] Failed for token ${tokenId} on ${contractAddress}: ${msg}`,
    );
    return { ok: false, error: msg };
  }
}

/**
 * Record the game behind a token, from the metadata embedded in its URI.
 *
 * There is no registry in v2.x and no `game_metadata()` entrypoint — upstream,
 * GameMetadata is only ever a renderer input — so a token's URI is the only
 * place a game's name, developer, publisher, genre and image are exposed. They
 * are identical on every token a game issues, so the last write simply wins;
 * a game that renames itself is picked up by the next token fetched.
 *
 * Best-effort: a game row is a convenience for `/games`, and failing to write
 * one must not fail the token fetch that produced it.
 */
async function upsertGame(
  contractAddress: string,
  parsed: ReturnType<typeof parseTokenUriAttributes>,
): Promise<void> {
  // Nothing to record — an older or minimal renderer.
  if (
    parsed.gameName === null &&
    parsed.gameDeveloper === null &&
    parsed.gamePublisher === null &&
    parsed.gameGenre === null &&
    parsed.gameImage === null
  ) {
    return;
  }

  const fields = {
    name: parsed.gameName,
    developer: parsed.gameDeveloper,
    publisher: parsed.gamePublisher,
    genre: parsed.gameGenre,
    image: parsed.gameImage,
    clientUrl: parsed.clientUrl,
    rendererAddress: parsed.rendererAddress,
    skillsAddress: parsed.skillsAddress,
    lastUpdatedAt: new Date(),
  };

  try {
    await db
      .insert(schema.games)
      .values({ contractAddress, ...fields })
      .onConflictDoUpdate({ target: schema.games.contractAddress, set: fields });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[URI] Could not upsert game ${contractAddress}: ${msg}`);
  }
}

/**
 * Mark a token's URI fetch as permanently failed. Subsequent poll cycles
 * skip it via the `token_uri_fetch_failed = false` filter in the work
 * queue. Reset manually (UPDATE ... SET token_uri_fetch_failed = false)
 * when the underlying issue is fixed (e.g. game contract upgrade).
 */
async function markFailed(
  contractAddress: string,
  tokenId: bigint,
  error: string,
): Promise<void> {
  // PG text columns reject NUL bytes; truncate huge errors to a sensible
  // length so triage stays readable.
  const truncated = error.replace(/\0/g, "").slice(0, 2000);
  await db
    .update(schema.tokens)
    .set({
      tokenUriFetchFailed: true,
      tokenUriFetchLastError: truncated,
      lastUpdatedAt: new Date(),
    })
    .where(tokenRow(contractAddress, tokenId));
}


const GAME_METADATA_ABI = [
  {
    type: "function",
    name: "game_metadata",
    inputs: [],
    outputs: [{ type: "core::felt252" }],
    state_mutability: "view",
  },
] as const;

/// Per-contract, so cached for the process lifetime in both directions.
const gameMetadataCache = new Map<
  string,
  { gameName: string | null; gameDeveloper: string | null; gamePublisher: string | null; gameGenre: string | null; gameImage: string | null } | null
>();

/**
 * A game's identity from `game_metadata()`, or null when it does not expose it.
 *
 * Constant per contract, hence the cache: a game that lacks the entrypoint must
 * not be probed once per token forever.
 */
async function tryGameMetadata(contractAddress: string) {
  if (gameMetadataCache.has(contractAddress)) {
    return gameMetadataCache.get(contractAddress)!;
  }
  let out = null;
  try {
    const c = new Contract({
      abi: GAME_METADATA_ABI as never,
      address: contractAddress,
      providerOrAccount: provider,
    });
    const res = (await c.call("game_metadata", [])) as Record<string, unknown>;
    // An empty ByteArray means "not set", not "set to empty". Mapping it to
    // null keeps the URI-parsed value rather than blanking a good one.
    const str = (v: unknown): string | null => {
      if (v == null) return null;
      const out = String(v);
      return out.length > 0 ? out : null;
    };
    out = {
      gameName: str(res?.name),
      gameDeveloper: str(res?.developer),
      gamePublisher: str(res?.publisher),
      gameGenre: str(res?.genre),
      gameImage: str(res?.image),
    };
  } catch {
    out = null;
  }
  gameMetadataCache.set(contractAddress, out);
  return out;
}


/** Decimal-or-hex string to the 0x form the RPC expects. */
function toHex(v: string | number | bigint): string {
  return "0x" + BigInt(v).toString(16);
}

/**
 * Decode a Cairo `ByteArray` response: [num_full_words, ...words, pending_word,
 * pending_len]. Returns "" for anything malformed rather than throwing — this
 * runs over whatever a game chose to return.
 */
function decodeByteArray(res: string[]): string {
  try {
    const numWords = Number(BigInt(res[0]!));
    let out = "";
    const wordToStr = (hex: string) => {
      let h = BigInt(hex).toString(16);
      if (h.length % 2 === 1) h = "0" + h;
      let acc = "";
      for (let i = 0; i < h.length; i += 2) {
        const code = parseInt(h.slice(i, i + 2), 16);
        if (code > 0) acc += String.fromCharCode(code);
      }
      return acc;
    };
    for (let i = 0; i < numWords; i += 1) out += wordToStr(res[1 + i]!);
    const pendingWord = res[1 + numWords];
    const pendingLen = res[2 + numWords];
    if (pendingWord !== undefined && pendingLen !== undefined && BigInt(pendingLen) > 0n) {
      out += wordToStr(pendingWord);
    }
    return out;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC batching
//
// The node accepts a JSON-RPC 2.0 batch — an array of requests in one HTTP
// body, correlated by id. So N reads cost one round trip regardless of which
// contracts they target.
//
// This is why the fan-out is NOT done with a contract-side batch entrypoint.
// Such an entrypoint would only help games built against a game-components
// version that has it and redeployed — which is no game that exists today —
// and it could never span contracts, so `context_details` on the metagame
// would still need its own call. Batching at the transport layer works
// against every already-deployed contract and crosses contracts freely.
// ---------------------------------------------------------------------------

interface RpcCall {
  contract: string;
  selector: string;
  calldata: string[];
}

/// Cap on sub-requests per HTTP body. Large enough that a poll is a handful of
/// round trips, small enough that one oversized body cannot be rejected
/// wholesale — a rejected batch loses every read in it, not just the big one.
const RPC_BATCH = 50;

/**
 * Run `calls` as JSON-RPC batches. Returns one entry per call, in order:
 * the felt array on success, or null where that individual call failed.
 *
 * A failure is per-call, never per-batch: one reverting read (an unregistered
 * token, an absent entrypoint) must not blind us to the other 49.
 */
async function rpcBatch(calls: RpcCall[]): Promise<(string[] | null)[]> {
  const out: (string[] | null)[] = new Array(calls.length).fill(null);

  for (let start = 0; start < calls.length; start += RPC_BATCH) {
    const chunk = calls.slice(start, start + RPC_BATCH);
    const body = chunk.map((c, i) => ({
      jsonrpc: "2.0",
      id: start + i,
      method: "starknet_call",
      params: {
        request: {
          contract_address: c.contract,
          entry_point_selector: c.selector,
          calldata: c.calldata,
        },
        block_id: "latest",
      },
    }));

    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn(`[RPC] batch HTTP ${res.status}; ${chunk.length} call(s) skipped`);
        continue;
      }
      const parsed = (await res.json()) as Array<{
        id: number;
        result?: string[];
        error?: unknown;
      }>;
      // Correlate by id, never by position: the spec permits any order, and
      // zipping by index would attribute one token's answer to another.
      if (!Array.isArray(parsed)) {
        console.warn("[RPC] batch response was not an array; chunk skipped");
        continue;
      }
      for (const entry of parsed) {
        if (entry && typeof entry.id === "number" && Array.isArray(entry.result)) {
          out[entry.id] = entry.result;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[RPC] batch failed: ${msg.slice(0, 120)}`);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Token state and per-token fields, from the game's typed entrypoints
//
// The URI is presentation. Everything with a typed entrypoint is read from
// the game, so a renderer that omits a trait costs us artwork and never data
// — which is exactly how Context was lost.
//
// Cost is shaped deliberately, because this is ongoing work rather than a
// one-off:
//
//   * MUTABLE state (score, game_over) uses the Span-taking batch
//     entrypoints, so it is one pair of calls per CONTRACT per chunk rather
//     than one per token, and it skips tokens already finished.
//   * STATIC fields (player_name, client_url) are filled once, like context.
//     They are set at mint and rarely change, so polling them would be
//     ongoing cost for a one-time answer.
// ---------------------------------------------------------------------------

/// Selectors, precomputed once. `hash.getSelectorFromName` is pure, but doing
/// it per token per poll is needless work.
const SEL = {
  score_batch: hash.getSelectorFromName("score_batch"),
  game_over_batch: hash.getSelectorFromName("game_over_batch"),
  player_name: hash.getSelectorFromName("player_name"),
  client_url: hash.getSelectorFromName("client_url"),
  context_details: hash.getSelectorFromName("context_details"),
  supports_interface: hash.getSelectorFromName("supports_interface"),
  game_metadata: hash.getSelectorFromName("game_metadata"),
};

/// Ids per `score_batch` / `game_over_batch` call. These take a Span, so the
/// game does the fan-out on chain — cheaper than one sub-request per token
/// even inside a JSON-RPC batch.
const STATE_BATCH = 100;

/** Decode a Cairo Array<T> response: [len, ...items]. */
function decodeArray(res: string[] | null, expected: number): string[] | null {
  if (!res || res.length === 0) return null;
  const len = Number(BigInt(res[0]!));
  if (len !== expected) return null;
  return res.slice(1, 1 + len);
}

/**
 * Refresh `current_score` and `game_over` in bulk.
 *
 * Two layers of batching: the game's Span-taking entrypoints fan out on
 * chain, and the resulting calls are sent as one JSON-RPC body. A poll over
 * many contracts is therefore a handful of round trips, not one per contract.
 *
 * Tokens already game over are skipped — their score is final.
 */
async function processTokenState(): Promise<number> {
  const rows = await db
    .select({
      tokenId: schema.tokens.tokenId,
      contractAddress: schema.tokens.contractAddress,
      // Chain time of the last MetadataUpdate — the completion timestamp for
      // whichever of these tokens turns out to have finished.
      metadataUpdateAt: schema.tokens.metadataUpdateAt,
      completedAt: schema.tokens.completedAt,
    })
    .from(schema.tokens)
    .where(eq(schema.tokens.gameOver, false));

  if (rows.length === 0) return 0;

  // Keep the row beside its id so the transition can read its timestamp.
  const rowByKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) rowByKey.set(`${r.contractAddress}:${r.tokenId}`, r);

  const byContract = new Map<string, string[]>();
  for (const r of rows) {
    const list = byContract.get(r.contractAddress) ?? [];
    list.push(r.tokenId);
    byContract.set(r.contractAddress, list);
  }

  // Build every chunk's pair of calls up front, then send them together.
  const calls: RpcCall[] = [];
  const chunks: { contract: string; ids: string[] }[] = [];
  for (const [contract, ids] of byContract) {
    for (let i = 0; i < ids.length; i += STATE_BATCH) {
      const chunk = ids.slice(i, i + STATE_BATCH);
      const span = [toHex(chunk.length), ...chunk.map(toHex)];
      calls.push({ contract, selector: SEL.score_batch, calldata: span });
      calls.push({ contract, selector: SEL.game_over_batch, calldata: span });
      chunks.push({ contract, ids: chunk });
    }
  }

  const results = await rpcBatch(calls);

  let updated = 0;
  for (let c = 0; c < chunks.length; c += 1) {
    const { contract, ids } = chunks[c]!;
    const scores = decodeArray(results[c * 2] ?? null, ids.length);
    const overs = decodeArray(results[c * 2 + 1] ?? null, ids.length);
    // A short or missing response would misalign values with ids, writing one
    // token's score onto another. Skip the chunk rather than zip blindly.
    if (!scores || !overs) continue;

    for (let k = 0; k < ids.length; k += 1) {
      const isOver = BigInt(overs[k]!) !== 0n;
      const update: Record<string, unknown> = {
        currentScore: BigInt(scores[k]!),
        gameOver: isOver,
        lastUpdatedAt: new Date(),
      };

      // This query selected only tokens with game_over = false, so a token
      // reading true here has just TRANSITIONED. That is the one moment we
      // can stamp a completion time, and the honest value is the chain time
      // of the MetadataUpdate that carried it — not now(), which is poll time
      // and could be a whole interval late.
      //
      // Guarded on completedAt being unset so a re-observation can never move
      // an already-recorded completion, and on metadataUpdateAt existing:
      // tokens that completed before this column did have no honest value,
      // and 0 would read as the epoch rather than as "unknown".
      if (isOver) {
        const row = rowByKey.get(`${contract}:${ids[k]!}`);
        if (row && row.completedAt === null && row.metadataUpdateAt !== null) {
          update.completedAt = row.metadataUpdateAt;
        }
      }
      await db
        .update(schema.tokens)
        .set(update)
        .where(tokenRow(contract, BigInt(ids[k]!)));
      updated += 1;
    }
  }

  if (updated > 0) console.log(`[State] refreshed ${updated} token(s)`);
  return updated;
}

/**
 * Fill `player_name` and `client_url` once per token, both reads for all
 * pending tokens in one batch.
 *
 * Set at mint, so scanning on null keeps this one-time per token rather than
 * a poll.
 */
async function processPerTokenFields(): Promise<number> {
  const rows = await db
    .select({
      tokenId: schema.tokens.tokenId,
      contractAddress: schema.tokens.contractAddress,
    })
    .from(schema.tokens)
    .where(isNull(schema.tokens.playerName))
    .limit(500);

  if (rows.length === 0) return 0;

  const calls: RpcCall[] = [];
  for (const r of rows) {
    calls.push({
      contract: r.contractAddress,
      selector: SEL.player_name,
      calldata: [toHex(r.tokenId)],
    });
    calls.push({
      contract: r.contractAddress,
      selector: SEL.client_url,
      calldata: [toHex(r.tokenId)],
    });
  }
  const results = await rpcBatch(calls);

  let filled = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const update: Record<string, unknown> = {};

    const nameRes = results[i * 2];
    if (nameRes && nameRes.length > 0 && BigInt(nameRes[0]!) !== 0n) {
      const decoded = feltToString(nameRes[0]!);
      if (decoded.length > 0) update.playerName = decoded;
    }
    const urlRes = results[i * 2 + 1];
    if (urlRes && urlRes.length > 0) {
      const url = decodeByteArray(urlRes);
      if (url.length > 0) update.clientUrl = url;
    }

    if (Object.keys(update).length === 0) continue;
    await db
      .update(schema.tokens)
      .set(update)
      .where(tokenRow(row.contractAddress, BigInt(row.tokenId)));
    filled += 1;
  }

  if (filled > 0) console.log(`[Fields] filled ${filled} token(s)`);
  return filled;
}

// ---------------------------------------------------------------------------
// Context enrichment
//
// A token minted by a metagame (Budokan, and anything else implementing the
// standard) belongs to a "context" — a tournament, a season, a league. The
// token URI is NOT a reliable source for it: self-bound games render their own
// metadata, and a game that omits the Context traits leaves the field empty
// however correct the metagame is. So we ask the metagame directly.
//
// This is generic, not per-metagame. The chain is:
//
//   token.has_context -> minters(contract_address, minted_by) -> metagame
//     -> supports_interface(IMETAGAME_CONTEXT_ID)
//     -> context_details(game_address, token_id)
//
// identifying a metagame by SRC5 exactly as a minigame is identified, so a new
// metagame needs no code here.
//
// `context_details` takes the PAIR because a token id is unique only within
// the contract that minted it. The bare-id form of this lookup was deleted
// upstream (game-components 3647904) for that reason: two games can mint the
// same packed id, and a bare-id answer has to guess.
// ---------------------------------------------------------------------------

/// SRC5 id of `IMetagameContext` as of game-components v2.3.0, derived from
/// `has_context(ContractAddress,felt252)->E((),())`.
///
/// A metagame built against the pre-v2.3.0 shape registers a DIFFERENT id, so
/// it answers false here and is skipped — which is the intent. Probing the old
/// id and dispatching the new signature would revert on argument count.
const IMETAGAME_CONTEXT_ID =
  "0x1619dc3272af5ae7e632e00012211abb89ee97571405c6714125b4c4eb77bb4";

const SRC5_ABI = [
  {
    type: "function",
    name: "supports_interface",
    inputs: [{ name: "interface_id", type: "core::felt252" }],
    outputs: [{ type: "core::bool" }],
    state_mutability: "view",
  },
] as const;

const CONTEXT_ABI = [
  {
    type: "function",
    name: "context_details",
    inputs: [
      { name: "game_address", type: "core::starknet::contract_address::ContractAddress" },
      { name: "token_id", type: "core::felt252" },
    ],
    outputs: [{ type: "(core::byte_array::ByteArray, core::byte_array::ByteArray, core::option::Option::<core::integer::u32>)" }],
    state_mutability: "view",
  },
] as const;

/// Per-metagame SRC5 result. Cached for the process lifetime in BOTH
/// directions: a metagame that does not serve context would otherwise be
/// probed once per token, forever.
const contextCapable = new Map<string, boolean>();

async function servesContext(metagame: string): Promise<boolean> {
  const cached = contextCapable.get(metagame);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    const c = new Contract({ abi: SRC5_ABI as never, address: metagame, providerOrAccount: provider });
    const res = await c.call("supports_interface", [IMETAGAME_CONTEXT_ID]);
    ok = res === true || res === 1n;
  } catch {
    // A contract without SRC5 at all. Not an error — just not a context
    // provider. Cached so we ask once.
    ok = false;
  }
  contextCapable.set(metagame, ok);
  return ok;
}

/**
 * Fill `context_id` / `context_name` for tokens that carry the has_context bit
 * but have no context recorded yet.
 *
 * Deliberately narrow: `has_context = true AND context_id IS NULL`. A token
 * whose URI already carried the traits is skipped, and one whose metagame
 * refuses the pair stays null rather than being retried into a hot loop —
 * `context_details` panics for an unregistered pair by design.
 */
async function processMissingContext(): Promise<number> {
  const rows = await db
    .select({
      tokenId: schema.tokens.tokenId,
      contractAddress: schema.tokens.contractAddress,
      mintedBy: schema.tokens.mintedBy,
    })
    .from(schema.tokens)
    .where(and(eq(schema.tokens.hasContext, true), isNull(schema.tokens.contextId)));

  if (rows.length === 0) return 0;
  console.log(`[Context] ${rows.length} token(s) with context but no context_id`);

  // Resolve minters first. minter_id is namespaced by the issuing contract —
  // every game hands out minter_id 1 to its own first minter — so both halves
  // of the key are required.
  const targets: { row: (typeof rows)[number]; minter: string }[] = [];
  for (const row of rows) {
    const [minter] = await db
      .select({ contractAddress: schema.minters.contractAddress })
      .from(schema.minters)
      .where(
        and(
          eq(schema.minters.tokenContractAddress, row.contractAddress),
          eq(schema.minters.minterId, row.mintedBy),
        ),
      )
      .limit(1);
    if (!minter) continue; // not indexed yet; a later pass retries
    targets.push({ row, minter: minter.contractAddress });
  }
  if (targets.length === 0) return 0;

  // SRC5 probe, one sub-request per DISTINCT metagame rather than per token.
  const unknown = [...new Set(targets.map((t) => t.minter))].filter(
    (m) => !contextCapable.has(m),
  );
  if (unknown.length > 0) {
    const probes = await rpcBatch(
      unknown.map((m) => ({
        contract: m,
        selector: SEL.supports_interface,
        calldata: [IMETAGAME_CONTEXT_ID],
      })),
    );
    unknown.forEach((m, i) => {
      const r = probes[i];
      contextCapable.set(m, !!r && r.length > 0 && BigInt(r[0]!) !== 0n);
    });
  }

  const serving = targets.filter((t) => contextCapable.get(t.minter));
  if (serving.length === 0) return 0;

  // `context_details(game_address, token_id)` — the PAIR, because a token id
  // is unique only within the contract that minted it.
  const results = await rpcBatch(
    serving.map((t) => ({
      contract: t.minter,
      selector: SEL.context_details,
      calldata: [t.row.contractAddress, toHex(t.row.tokenId)],
    })),
  );

  let filled = 0;
  for (let i = 0; i < serving.length; i += 1) {
    const res = results[i];
    // A pair the metagame does not recognise panics by design — Budokan
    // refuses rather than returning context 0, so a caller authorizing on
    // `.id` cannot read a confident-looking zero. That arrives here as a null
    // result and is simply left unfilled.
    if (!res) continue;
    const parsed = parseContextDetails(res);
    if (!parsed) continue;

    const update: Record<string, unknown> = {};
    if (parsed.id !== null && parsed.id !== 0) update.contextId = parsed.id;
    if (parsed.name.length > 0) update.contextName = parsed.name;
    if (Object.keys(update).length === 0) continue;

    const { row } = serving[i]!;
    await db
      .update(schema.tokens)
      .set(update)
      .where(tokenRow(row.contractAddress, BigInt(row.tokenId)));
    filled += 1;
  }

  if (filled > 0) console.log(`[Context] filled ${filled} token(s)`);
  return filled;
}

/**
 * Decode `GameContextDetails { name, description, id: Option<u32>, context }`.
 *
 * Hand-decoded because these are raw felts from a batched call rather than a
 * dispatcher response. Returns null on anything unexpected — a malformed
 * answer must leave the field null, never write a wrong context.
 */
function parseContextDetails(res: string[]): { name: string; id: number | null } | null {
  try {
    let i = 0;
    const readByteArray = (): string => {
      const numWords = Number(BigInt(res[i]!));
      const slice = res.slice(i, i + numWords + 3);
      i += numWords + 3;
      return decodeByteArray(slice);
    };
    const name = readByteArray();
    readByteArray(); // description, unused
    // Option<u32>: 0 = Some(value), 1 = None.
    const tag = BigInt(res[i]!);
    i += 1;
    let id: number | null = null;
    if (tag === 0n) {
      id = Number(BigInt(res[i]!));
      i += 1;
    }
    return { name, id };
  } catch {
    return null;
  }
}


async function processUnfetched(): Promise<number> {
  // Exclude tokens that have already exhausted their in-process retry
  // burst — same on-chain state next poll would just revert the same way.
  const unfetched = await db
    .select({
      tokenId: schema.tokens.tokenId,
      // The issuing contract: both the RPC target and half the row identity.
      contractAddress: schema.tokens.contractAddress,
      // Snapshot the dirty marker now; fetchAndStore only marks the token clean
      // if it hasn't advanced by the time the RPC result is written back.
      metadataUpdateBlock: schema.tokens.metadataUpdateBlock,
    })
    .from(schema.tokens)
    .where(
      and(
        eq(schema.tokens.tokenUriFetched, false),
        eq(schema.tokens.tokenUriFetchFailed, false),
      ),
    );

  if (unfetched.length === 0) {
    return 0;
  }

  console.log(`[URI Fetcher] Found ${unfetched.length} unfetched tokens`);
  let fetched = 0;
  let failed = 0;

  for (let i = 0; i < unfetched.length; i += CONCURRENCY) {
    const batch = unfetched.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (row) => {
        const tokenId = BigInt(row.tokenId);
        const contractAddress = row.contractAddress;
        const seenBlock = row.metadataUpdateBlock ?? 0n;
        let lastError = "no attempts";
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          const result = await fetchAndStore(contractAddress, tokenId, seenBlock);
          if (result.ok) return true;
          lastError = result.error;
          const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
          await new Promise((r) => setTimeout(r, delay));
        }
        // In-process burst exhausted: quarantine permanently so the next
        // poll cycle skips this token.
        await markFailed(contractAddress, tokenId, lastError);
        return false;
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) fetched++;
      else failed++;
    }

    // Brief pause between batches
    if (i + CONCURRENCY < unfetched.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(
    `[URI Fetcher] Done: ${fetched} fetched, ${failed} failed, ${unfetched.length} total`,
  );
  return unfetched.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`[URI Fetcher] Starting (concurrency=${CONCURRENCY}, poll=${POLL_INTERVAL_MS}ms, watch=${WATCH})`);
  console.log(`[URI Fetcher] RPC: ${RPC_URL}`);

  if (WATCH) {
    // Continuous mode: poll for unfetched tokens
    while (true) {
      const count = await processUnfetched();
      // Runs every poll, not only when URIs are pending: context arrives from
      // the metagame, so a token can need it long after its URI settled.
      await processMissingContext();
      await processTokenState();
      await processPerTokenFields();
      if (count === 0) {
        console.log(
          `[URI Fetcher] No unfetched tokens, sleeping ${POLL_INTERVAL_MS / 1000}s...`,
        );
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  } else {
    // One-shot mode
    await processUnfetched();
    await processMissingContext();
    await processTokenState();
    await processPerTokenFields();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[URI Fetcher] Fatal error:", err);
  process.exit(1);
});
