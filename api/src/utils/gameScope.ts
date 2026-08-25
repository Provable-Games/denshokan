import { eq, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { tokens, games } from "../db/schema.js";

/**
 * Scoping token queries to "one game", across both generations.
 *
 * The two generations name a game differently, and neither name works for the
 * other:
 *
 *   * A legacy token carries a numeric `game_id` from the registry, and no
 *     contract address of its own — every one of them was minted by the single
 *     denshokan.
 *   * A self-bound token has no `game_id` at all. The game IS the contract, so
 *     its identity is `contract_address`.
 *
 * That is why `game_id` alone is not a sufficient filter any more: an equality
 * test on it silently excludes every self-bound token, returning a confidently
 * short list rather than an error. Callers should prefer `game_address`, which
 * resolves against both.
 */

// game address -> legacy game id, for addresses that are in the registry.
let addressToGameId = new Map<string, number>();
let cacheReady = false;

async function loadCache() {
  const rows = await db
    .select({ gameId: games.gameId, contractAddress: games.contractAddress })
    .from(games);
  addressToGameId = new Map(rows.map((r) => [r.contractAddress, r.gameId]));
  cacheReady = true;
}

async function legacyGameIdFor(address: string): Promise<number | null> {
  if (!cacheReady) await loadCache();
  const hit = addressToGameId.get(address);
  if (hit !== undefined) return hit;
  // Cache miss — refresh and retry once, in case the game registered after
  // this process last loaded.
  await loadCache();
  return addressToGameId.get(address) ?? null;
}

/**
 * A condition matching every token belonging to the game at `address`,
 * whichever generation minted it.
 *
 * Matches self-bound tokens on contract_address, and — if the address is also
 * a registered legacy game — that game's legacy tokens on game_id. A game that
 * exists in only one generation simply contributes no rows from the other.
 */
export async function gameAddressCondition(address: string): Promise<SQL> {
  const legacyId = await legacyGameIdFor(address);
  const selfBound = eq(tokens.contractAddress, address);
  return legacyId === null ? selfBound : or(selfBound, eq(tokens.gameId, legacyId))!;
}
