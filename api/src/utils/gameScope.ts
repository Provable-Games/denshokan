import { eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { tokens } from "../db/schema.js";

/**
 * Scope token queries to one game.
 *
 * A game IS its contract — every game is its own ERC721 — so this is a plain
 * equality on the issuing address. There is no registry and no numeric game
 * id to resolve through.
 */
export function gameAddressCondition(address: string): SQL {
  return eq(tokens.contractAddress, address);
}
