/**
 * Token context resolved from the METAGAME contract, not from token metadata.
 *
 * `context_id` used to be scraped out of the token's own `token_uri` JSON (the
 * "Context ID" attribute). That stopped working: a game built against the
 * stripped standard renders no attributes at all — the v2.5.0 Death Mountain
 * token returns name/description/image and nothing else — so every token
 * indexed from such a game has a null context, and `useTokens(context_id)`
 * finds none of them. Re-indexing cannot help, because it re-reads the same
 * JSON.
 *
 * The tournament contract is the authoritative source anyway: it is what
 * assigns the context in the first place. This module asks it directly.
 *
 * The lookup is keyed on (game_address, token_id), never a bare token id. A
 * token id is unique only within the contract that minted it, and v2 lets every
 * tournament bring its own game, so a bare id is genuinely ambiguous — Budokan
 * carries the game address for exactly this reason.
 */

import { Contract, RpcProvider } from "starknet";
import { readFileSync } from "fs";
import { resolve } from "path";

const metagameAbi = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "src/lib/abi/metagame-context.json"),
    "utf-8",
  ),
);

/**
 * SRC5 id for IMetagameContext, from game-components
 * `packages/interfaces/src/metagame/context.cairo` at the revision Budokan
 * pins (v2.5.0 / cc0af45).
 *
 * Upstream derives it by XOR-ing extended function selectors, so it MOVES if
 * `has_context`/`context_details` are ever renamed or their signatures change
 * — as happened when the pair key gained `game_address`. A drifted id does not
 * error: `supports_interface` simply answers false, every token silently
 * indexes with a null context, and nothing in the pipeline complains. If
 * context goes uniformly null after a game-components repin, suspect this
 * constant before suspecting the contract.
 */
export const IMETAGAME_CONTEXT_ID =
  "0x1619dc3272af5ae7e632e00012211abb89ee97571405c6714125b4c4eb77bb4";

export interface TokenContext {
  contextId: number | null;
  contextName: string | null;
}

/**
 * A metagame that does not advertise IMetagameContext is not asked twice.
 *
 * The support answer is a property of the deployed class, so it is cached per
 * address for the process lifetime. Note the cache is deliberately NOT
 * negative-permanent across restarts: an `upgrade()` plus
 * `sync_supported_interfaces()` can flip a false to true without the address
 * changing, and a restart is how that gets picked up.
 */
const supportsContext = new Map<string, boolean>();
const metagameContracts = new Map<string, Contract>();

function metagameFor(address: string, provider: RpcProvider): Contract {
  let c = metagameContracts.get(address);
  if (!c) {
    c = new Contract({
      abi: metagameAbi,
      address,
      providerOrAccount: provider,
    });
    metagameContracts.set(address, c);
  }
  return c;
}

/** Cairo `Option<u32>` decodes as a CairoOption-like or a plain value. */
function readOptionU32(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "bigint" || typeof value === "number") {
    return Number(value);
  }
  const opt = value as {
    isSome?: () => boolean;
    unwrap?: () => unknown;
    Some?: unknown;
  };
  if (typeof opt.isSome === "function" && typeof opt.unwrap === "function") {
    return opt.isSome() ? Number(opt.unwrap() as bigint) : null;
  }
  if (opt.Some !== undefined && opt.Some !== null) return Number(opt.Some as bigint);
  return null;
}

/**
 * Resolve a token's tournament context from the metagame that minted it.
 *
 * Returns nulls rather than throwing: context is an enrichment, and a token
 * whose context cannot be read must still index with its score and game-over
 * state intact. Every early return below is a legitimate "no context", not an
 * error condition:
 *
 *  - the minter is not a metagame (a directly-minted token has no tournament)
 *  - the metagame does not implement IMetagameContext
 *  - the (game, token) pair is not registered
 *
 * `context_details` PANICS for an unregistered pair by design — it must not
 * hand back a confident-looking zero to a caller that authorizes on `.id` — so
 * `has_context` is checked first rather than catching the revert.
 */
export async function resolveTokenContext(
  provider: RpcProvider,
  gameAddress: string,
  tokenId: bigint,
  minterAddress: string | null,
): Promise<TokenContext> {
  const none: TokenContext = { contextId: null, contextName: null };

  if (!minterAddress || BigInt(minterAddress) === 0n) return none;

  try {
    const metagame = metagameFor(minterAddress, provider);

    let supported = supportsContext.get(minterAddress);
    if (supported === undefined) {
      supported = Boolean(
        await metagame.call("supports_interface", [IMETAGAME_CONTEXT_ID]),
      );
      supportsContext.set(minterAddress, supported);
    }
    if (!supported) return none;

    const has = await metagame.call("has_context", [gameAddress, tokenId]);
    if (!has) return none;

    const details = (await metagame.call("context_details", [
      gameAddress,
      tokenId,
    ])) as { name?: unknown; id?: unknown };

    return {
      contextId: readOptionU32(details.id),
      contextName:
        typeof details.name === "string" && details.name.length > 0
          ? details.name
          : null,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(
      `[context] ${gameAddress}/${tokenId} via ${minterAddress}: ${msg}`,
    );
    return none;
  }
}
