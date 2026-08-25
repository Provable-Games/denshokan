# Running the v2 stack

This branch indexes the self-bound token generation **only**. Every game is
its own ERC721, so there is no shared denshokan token contract and no registry
— `GAME_ADDRESSES` is the whole subscription.

It is a clean break, not a migration: the new deployment starts from an empty
database. The retired denshokan's data is not carried over, and this code
cannot read it (the two token-id layouts share no field offsets). To read that
generation, pin an earlier release.

## Configuration

| Variable | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | **a fresh database** | Migrations `0000`–`0014` build the schema from empty. |
| `GAME_ADDRESSES` | game contracts, comma-separated | **Required.** Empty means nothing to index, so the indexer refuses to start rather than sit silently idle. |
| `STARTING_BLOCK` | the earliest game's deploy block | Not 0 — there is no pre-v2 history worth streaming. |
| `STREAM_URL` | the DNA stream for that network | Sepolia games need the Sepolia stream. |
| `RPC_URL`, `RPC_API_KEY` | any Starknet RPC | Read by `scripts/fetch-token-uris.ts` only; the indexer itself makes zero RPC calls. |

`DENSHOKAN_ADDRESS` and `REGISTRY_ADDRESS` are gone — neither contract exists
in this generation.

## A game must be listed BEFORE it mints

The indexer persists a cursor under `indexerName: "denshokan"` and resumes from
it. Adding an address to `GAME_ADDRESSES` widens the event filter from that
cursor **forward only**: every mint the game emitted earlier is never streamed,
and nothing reports a gap — the tokens simply are not there.

So either list a game before its first mint, or re-index from its deploy block
into a fresh database. Deploying a game and adding it to `GAME_ADDRESSES`
afterwards is the case to avoid.

## Where game metadata comes from

There is no registry, and v2.x has no `game_metadata()` entrypoint — upstream,
`GameMetadata` is only ever an input to the renderer. So a game's name,
developer, publisher, genre and image exist in exactly one place on chain: the
JSON embedded in each of its token URIs.

`scripts/fetch-token-uris.ts` parses those fields out of every URI it fetches
and upserts them into `games`, keyed by contract address. Consequences worth
knowing:

- A game appears in `games` only after **one of its tokens has been fetched**.
  A game with no mints, or whose first mint has not been fetched yet, is
  absent from `/games`.
- The values are identical on every token a game issues, so the last write
  wins. A game that renames itself is picked up by the next token fetched.
- The URI's `Game ID` and `Metadata` traits are always `0` in v2.x — a
  compatibility shim in the upstream `TokenMetadata` struct. Do not read them;
  the real 65-bit mint metadata comes from the packed token id.

## Identity: (contract, id), never id alone

A token id is unique only within the ERC721 that issued it. The layout carries
nothing distinguishing one game from another, and its collision protection —
a 10-bit `tx_hash` plus a 16-bit client salt — is transaction-scoped, so two
games minting in the same multicall can pack byte-identical ids.

The same applies to minters: `minter_counter` is per-contract storage
upstream, so every game hands out `minter_id` 1 to its own first minter.

Both are enforced by unique constraints, and every read and write is scoped to
the contract. Sanity checks:

```sql
-- The same id under two games is legitimate. The same PAIR twice is not.
SELECT contract_address, token_id, count(*)
FROM tokens GROUP BY 1, 2 HAVING count(*) > 1;
-- expect no rows

-- One game mapping one minter id to two addresses is not.
SELECT token_contract_address, minter_id, count(DISTINCT contract_address)
FROM minters GROUP BY 1, 2 HAVING count(DISTINCT contract_address) > 1;
-- expect no rows

-- Every row belongs to a configured game.
SELECT DISTINCT contract_address FROM tokens;

-- Timestamps in a sane window are the cheapest tell that decoding is right.
SELECT count(*) FROM tokens
WHERE minted_at < '2024-01-01' OR minted_at > now() + interval '1 day';
-- expect 0
```

A `minted_at` in 1970 or 2090, or a `settings_id` in the millions, means the
id layout does not match what the contract actually mints.
