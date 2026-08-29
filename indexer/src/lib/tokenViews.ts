/**
 * Mutable token state read from the GAME's views instead of its token URI.
 *
 * The URI's `attributes` array used to be the whole pipeline: Score, Game Over,
 * Objectives Completed, Player Name, Context ID. A game built against the
 * stripped standard renders none of it — the v2.5.0 token returns
 * name/description/image and stops — so every one of those columns silently
 * stayed null. Nothing errored; the tokens simply looked like they had never
 * been played.
 *
 * Views are also the better source independent of that: they are the game's own
 * state rather than a renderer's rendering of it, so they cannot drift from it
 * and cannot be dropped by a renderer change.
 *
 * `token_uri` is still fetched, for one reason: the artwork. `image` is a
 * TOP-LEVEL field of the metadata JSON, not an attribute, so it survives on
 * games that render no attributes at all — and no view exposes it. Structured
 * state comes from here; the picture comes from there.
 */

import { Contract, shortString } from "starknet";

/** What the game can tell us about one token. Null = the game did not say. */
export interface TokenViewState {
  score: bigint | null;
  gameOver: boolean | null;
  completedObjectives: boolean | null;
  completedAt: number | null;
  playerName: string | null;
  clientUrl: string | null;
}

/** A game-level value, identical for every token the game issues. */
export interface GameViewState {
  rendererAddress: string | null;
}

function toAddress(value: unknown): string | null {
  try {
    const n = BigInt(value as string | bigint);
    return n === 0n ? null : `0x${n.toString(16).padStart(64, "0")}`;
  } catch {
    return null;
  }
}

/**
 * `player_name` is a felt252 short string, empty when unset.
 *
 * decodeShortString on 0 yields "", which must stay null rather than becoming
 * an empty player name — the column means "not set", and "" would render as a
 * blank name in every client.
 */
function toShortString(value: unknown): string | null {
  try {
    const n = BigInt(value as string | bigint);
    if (n === 0n) return null;
    const s = shortString.decodeShortString(n.toString());
    return s.length > 0 ? s : null;
  } catch {
    return null;
  }
}

/**
 * Read one token's mutable state.
 *
 * Each field is resolved independently and a failure yields null for that field
 * alone: a game missing one entrypoint (`client_url` is not on every build)
 * must not cost us the score. Callers treat null as "leave the column alone",
 * so a partial read degrades instead of erasing.
 *
 * `token_metadata` is one call carrying game_over, completed_objective and
 * completed_at together, which is why those three are not fetched separately.
 */
export async function readTokenViews(
  game: Contract,
  tokenId: bigint,
): Promise<TokenViewState> {
  const state: TokenViewState = {
    score: null,
    gameOver: null,
    completedObjectives: null,
    completedAt: null,
    playerName: null,
    clientUrl: null,
  };

  const [meta, score, playerName, clientUrl] = await Promise.allSettled([
    game.call("token_metadata", [tokenId]),
    game.call("score", [tokenId]),
    game.call("player_name", [tokenId]),
    game.call("client_url", [tokenId]),
  ]);

  if (meta.status === "fulfilled") {
    const m = meta.value as Record<string, unknown>;
    if (m.game_over !== undefined) state.gameOver = Boolean(m.game_over);
    if (m.completed_objective !== undefined) {
      state.completedObjectives = Boolean(m.completed_objective);
    }
    // 0 means "not completed", not "completed at epoch 0".
    if (m.completed_at !== undefined) {
      const at = Number(m.completed_at as bigint);
      state.completedAt = at > 0 ? at : null;
    }
  }

  if (score.status === "fulfilled") {
    state.score = BigInt(score.value as unknown as string | bigint);
  }
  if (playerName.status === "fulfilled") {
    state.playerName = toShortString(playerName.value);
  }
  if (clientUrl.status === "fulfilled") {
    const url = clientUrl.value;
    state.clientUrl =
      typeof url === "string" && url.length > 0 ? url : null;
  }

  return state;
}

/**
 * Game-level values. Cached for the process lifetime — they are properties of
 * the deployed game, not of any token, so re-reading them per token would
 * multiply RPC load by the size of the work queue for a constant answer.
 */
const gameViewCache = new Map<string, GameViewState>();

export async function readGameViews(
  game: Contract,
  gameAddress: string,
): Promise<GameViewState> {
  const cached = gameViewCache.get(gameAddress);
  if (cached) return cached;

  let rendererAddress: string | null = null;
  try {
    rendererAddress = toAddress(await game.call("get_renderer_address", []));
  } catch {
    // Not every game exposes a renderer; absence is not an error.
  }

  const state: GameViewState = { rendererAddress };
  gameViewCache.set(gameAddress, state);
  return state;
}
