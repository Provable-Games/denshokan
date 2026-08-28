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
import { RpcProvider, Contract } from "starknet";
import { readFileSync } from "fs";
import { resolve } from "path";

import * as schema from "../src/lib/schema.js";
import { parseTokenUriAttributes } from "../src/lib/decoder.js";

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

    if (parsed.playerName !== null) tokenUpdate.playerName = parsed.playerName;
    if (parsed.contextId !== null) tokenUpdate.contextId = parsed.contextId;
    if (parsed.contextName !== null) tokenUpdate.contextName = parsed.contextName;
    if (parsed.clientUrl !== null) tokenUpdate.clientUrl = parsed.clientUrl;
    if (parsed.rendererAddress !== null)
      tokenUpdate.rendererAddress = parsed.rendererAddress;
    if (parsed.skillsAddress !== null)
      tokenUpdate.skillsAddress = parsed.skillsAddress;
    if (parsed.score !== null) tokenUpdate.currentScore = parsed.score;
    if (parsed.gameOver !== null) tokenUpdate.gameOver = parsed.gameOver;
    if (parsed.completedObjectives !== null)
      tokenUpdate.completedAllObjectives = parsed.completedObjectives;
    if (parsed.completedAt !== null)
      tokenUpdate.completedAt = parsed.completedAt;

    await db
      .update(schema.tokens)
      .set(tokenUpdate)
      .where(tokenRow(contractAddress, tokenId));

    await upsertGame(contractAddress, parsed);

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

  let filled = 0;
  for (const row of rows) {
    try {
      // minter_id is namespaced by the issuing contract — every game hands out
      // minter_id 1 to its own first minter — so both halves are required.
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
      if (!minter) continue; // minter not indexed yet; next pass will retry

      if (!(await servesContext(minter.contractAddress))) continue;

      const c = new Contract({
        abi: CONTEXT_ABI as never,
        address: minter.contractAddress,
        providerOrAccount: provider,
      });
      const details = (await c.call("context_details", [
        row.contractAddress,
        row.tokenId,
      ])) as { name?: unknown; id?: unknown };

      const name = details?.name != null ? String(details.name) : null;
      // Option<u32>: starknet.js surfaces Some(v) as the value, None as
      // undefined. 0 is not a valid context id upstream ("not registered"), so
      // it is treated as absent rather than written.
      const idRaw = details?.id;
      const id =
        idRaw === undefined || idRaw === null ? null : Number(idRaw as bigint | number);

      const update: Record<string, unknown> = {};
      if (id !== null && id !== 0) update.contextId = id;
      if (name) update.contextName = name;
      if (Object.keys(update).length === 0) continue;

      await db
        .update(schema.tokens)
        .set(update)
        .where(tokenRow(row.contractAddress, BigInt(row.tokenId)));
      filled += 1;
    } catch (err) {
      // Expected for a token the metagame does not consider registered —
      // context_details panics rather than returning an empty context, so a
      // caller cannot mistake "unknown" for "context 0".
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Context] ${row.tokenId} on ${row.contractAddress}: ${msg.slice(0, 120)}`);
    }
  }

  if (filled > 0) console.log(`[Context] filled ${filled} token(s)`);
  return filled;
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
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[URI Fetcher] Fatal error:", err);
  process.exit(1);
});
