/**
 * Backfill tokens.minted_to from the chain's mint events.
 *
 * One LINEAR keyed event scan over the token contract's `Transfer` events
 * from the zero address (every mint, in block order, ~1000 per page) — this
 * is NOT a reindex: it reads only mint transfers and issues NULL-guarded
 * UPDATEs, so it can run against the production database while the indexer
 * is live. Rows minted after the indexer deployed the minted_to write are
 * already populated and are skipped by the NULL guard; re-running is a no-op
 * for anything already filled.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/backfill-minted-to.ts --dry-run
 *   DATABASE_URL=... npx tsx scripts/backfill-minted-to.ts
 *   # resume / narrow the scan:
 *   DATABASE_URL=... npx tsx scripts/backfill-minted-to.ts --from-block 500000
 *
 * Env:
 *   DATABASE_URL      required
 *   RPC_URL           default https://rpc.provable.games/rpc (same as URI fetcher)
 *   TOKEN_CONTRACT    default mainnet denshokan token contract
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Pool } from "pg";
import { RpcProvider, hash, num } from "starknet";

import * as schema from "../src/lib/schema.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const RPC_URL = process.env.RPC_URL ?? "https://rpc.provable.games/rpc";
const TOKEN_CONTRACT =
  process.env.TOKEN_CONTRACT ??
  "0x00263cc540dac11334470a64759e03952ee2f84a290e99ba8cbc391245cd0bf9";

const DRY_RUN = process.argv.includes("--dry-run");
const fromBlockArg = process.argv.indexOf("--from-block");
const FROM_BLOCK = fromBlockArg !== -1 ? Number(process.argv[fromBlockArg + 1]) : 0;

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool, { schema });
const provider = new RpcProvider({ nodeUrl: RPC_URL });

async function main() {
  console.log(`[minted_to backfill] RPC: ${RPC_URL}`);
  console.log(`[minted_to backfill] token contract: ${TOKEN_CONTRACT}`);
  console.log(`[minted_to backfill] from block ${FROM_BLOCK}${DRY_RUN ? " (DRY RUN)" : ""}`);

  const [{ remaining }] = (
    await db
      .select({ remaining: sql<number>`count(*)::int` })
      .from(schema.tokens)
      .where(isNull(schema.tokens.mintedTo))
  );
  console.log(`[minted_to backfill] rows with minted_to IS NULL: ${remaining}`);
  if (remaining === 0) {
    console.log("[minted_to backfill] nothing to do");
    await pool.end();
    return;
  }

  const filter: Parameters<typeof provider.getEvents>[0] = {
    address: TOKEN_CONTRACT,
    // Transfer(from=0x0, to, token_id): every mint, nothing else.
    keys: [[hash.getSelectorFromName("Transfer")], ["0x0"]],
    from_block: { block_number: FROM_BLOCK },
    to_block: "latest",
    chunk_size: 1000,
  };

  let scanned = 0;
  let updated = 0;
  let pages = 0;

  for (;;) {
    const result = await provider.getEvents(filter);
    pages++;

    for (const event of result.events ?? []) {
      // keys = [selector, from, to, token_id.low, token_id.high]
      const to = event.keys[2];
      const low = event.keys[3];
      const high = event.keys[4];
      if (!to || low === undefined || high === undefined) continue;
      const tokenId = (BigInt(high) << 128n) | BigInt(low);
      scanned++;

      if (DRY_RUN) continue;
      const res = await db
        .update(schema.tokens)
        .set({ mintedTo: num.toHex(BigInt(to)) })
        .where(
          and(
            eq(schema.tokens.tokenId, tokenId.toString()),
            // NULL guard: never touch rows the live indexer already wrote.
            isNull(schema.tokens.mintedTo)
          )
        );
      updated += res.rowCount ?? 0;
    }

    if (pages % 10 === 0 || !result.continuation_token) {
      console.log(
        `[minted_to backfill] pages=${pages} mints_scanned=${scanned} rows_updated=${updated}`
      );
    }
    if (!result.continuation_token) break;
    filter.continuation_token = result.continuation_token;
  }

  const [{ left }] = (
    await db
      .select({ left: sql<number>`count(*)::int` })
      .from(schema.tokens)
      .where(isNull(schema.tokens.mintedTo))
  );
  console.log(
    `[minted_to backfill] done — pages=${pages} mints_scanned=${scanned} rows_updated=${updated} still_null=${left}`
  );
  if (left > 0) {
    console.log(
      "[minted_to backfill] remaining NULLs are tokens whose mint predates FROM_BLOCK, " +
        "on a different contract, or minted mid-run (the indexer fills those) — " +
        "re-run to verify convergence."
    );
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[minted_to backfill] fatal:", err);
  process.exit(1);
});
