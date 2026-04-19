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
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { RpcProvider, Contract } from "starknet";
import { readFileSync } from "fs";
import { resolve } from "path";

import * as schema from "../src/lib/schema.js";
import { parseTokenUriAttributes } from "../src/lib/decoder.js";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const WATCH = args.includes("--watch");

function getArgValue(name: string, defaultVal: string): string {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const CONCURRENCY = parseInt(getArgValue("--concurrency", "5"), 10);
const POLL_INTERVAL_MS = parseInt(getArgValue("--interval", "30000"), 10);
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;
const BATCH_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// Config from env
// ---------------------------------------------------------------------------

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/denshokan";
const RPC_URL =
  process.env.RPC_URL ?? "https://api.cartridge.gg/x/starknet/mainnet";
const RPC_API_KEY = process.env.RPC_API_KEY ?? "";
const DENSHOKAN_ADDRESS = (process.env.DENSHOKAN_ADDRESS ?? "0x0").trim();

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
const contract = new Contract({
  abi,
  address: DENSHOKAN_ADDRESS,
  providerOrAccount: provider,
});

/** Convert bigint token ID to string for numeric column storage */
const toId = (id: bigint) => id.toString();

// ---------------------------------------------------------------------------
// Fetch logic
// ---------------------------------------------------------------------------

async function fetchAndStore(tokenId: bigint): Promise<boolean> {
  try {
    const result = await contract.call("token_uri", [tokenId]);
    const uri = result.toString();

    const parsed = parseTokenUriAttributes(uri);

    const tokenUpdate: Record<string, unknown> = {
      tokenUri: uri,
      tokenUriFetched: true,
      lastUpdatedAt: new Date(),
    };

    if (parsed.playerName !== null) tokenUpdate.playerName = parsed.playerName;
    if (parsed.contextId !== null) tokenUpdate.contextId = parsed.contextId;
    if (parsed.clientUrl !== null) tokenUpdate.clientUrl = parsed.clientUrl;
    if (parsed.rendererAddress !== null)
      tokenUpdate.rendererAddress = parsed.rendererAddress;
    if (parsed.skillsAddress !== null)
      tokenUpdate.skillsAddress = parsed.skillsAddress;
    if (parsed.score !== null) tokenUpdate.currentScore = parsed.score;
    if (parsed.gameOver !== null) tokenUpdate.gameOver = parsed.gameOver;
    if (parsed.completedObjectives !== null)
      tokenUpdate.completedAllObjectives = parsed.completedObjectives;

    await db
      .update(schema.tokens)
      .set(tokenUpdate)
      .where(eq(schema.tokens.tokenId, toId(tokenId)));

    return true;
  } catch (error) {
    console.warn(`[URI] Failed for token ${tokenId}: ${error}`);
    return false;
  }
}

async function processUnfetched(): Promise<number> {
  const unfetched = await db
    .select({ tokenId: schema.tokens.tokenId })
    .from(schema.tokens)
    .where(eq(schema.tokens.tokenUriFetched, false));

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
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          if (await fetchAndStore(tokenId)) return true;
          const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
          await new Promise((r) => setTimeout(r, delay));
        }
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
  console.log(`[URI Fetcher] Starting (concurrency=${CONCURRENCY}, watch=${WATCH})`);
  console.log(`[URI Fetcher] RPC: ${RPC_URL}`);
  console.log(`[URI Fetcher] Contract: ${DENSHOKAN_ADDRESS}`);

  if (WATCH) {
    // Continuous mode: poll for unfetched tokens
    while (true) {
      const count = await processUnfetched();
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
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[URI Fetcher] Fatal error:", err);
  process.exit(1);
});
