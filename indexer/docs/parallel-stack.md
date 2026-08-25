# Trialling the v2 stack in parallel

The self-bound generation can be indexed on a **separate Railway stack** from
this branch, running beside production, before anything switches over.

Nothing in the code pins a branch or an environment — every input is an env
var — so a parallel stack is a Railway service pointed at the PR branch with
its own variables. No code change is needed to run one.

## Why parallel rather than in place

The migration widens `tokens.metadata` from `int4` to `numeric`, which
**rewrites the table**. Everything else in `0014` is metadata-only. On a
production-sized `tokens` table that rewrite wants a maintenance window, and a
trial stack lets you find out how long it takes on a copy first.

The decoder change is also the kind that fails silently if the generation
mapping is wrong (see below). Watching it against real chain data on a
throwaway database is worth more than any amount of local testing.

## What a trial stack needs

Point a new Railway service at the PR branch and give it:

| Variable | Trial value | Why it must differ from production |
| --- | --- | --- |
| `DATABASE_URL` | **a fresh database** | The trial writes rows and runs `0014`. Sharing production's database defeats the point and applies the rewrite to it. |
| `GAME_ADDRESSES` | the game contracts, comma-separated | The whole point of the trial. Empty means it behaves exactly like production. |
| `STARTING_BLOCK` | the earliest game's deploy block | Not 0 — you do not need legacy history again to trial v2 decoding. |
| `DENSHOKAN_ADDRESS`, `REGISTRY_ADDRESS` | same as production | Keep them so mixed-generation indexing is exercised, which is what production will actually do. |
| `STREAM_URL` | same network as the games | Sepolia games need the Sepolia DNA stream. |

The API service can point at the trial database the same way, if you want to
exercise reads too.

## Getting `GAME_ADDRESSES` right matters more than it looks

An address listed here is decoded with the **standard** token-id layout
(`token::packing` upstream). Anything else gets **legacy**
(`token_legacy::structs`). Those two names track the game-components module
names, so they are greppable against the Cairo — they are not a property of
the contracts themselves, which is why the variable is just `GAME_ADDRESSES`.

Get this wrong and nothing throws. The two layouts share no field offsets, so
a misrouted id decodes to a plausible timestamp, a plausible settings id and a
plausible minter id — all wrong, all written to the database as though they
were fine. There is no marker in the id to catch it.

So: only list contracts you have confirmed are v2.x, and sanity-check the
first few rows a trial stack writes. A `minted_at` in 1970 or 2090, or a
`settings_id` in the millions, means the mapping is wrong.

## Checking a trial stack is decoding correctly

```sql
-- Rows should split by generation exactly as configured.
SELECT generation, count(*), min(minted_at), max(minted_at)
FROM tokens GROUP BY generation;

-- Standard rows have no game_id and DO have a contract.
SELECT count(*) FROM tokens
WHERE generation = 'standard' AND (game_id IS NOT NULL OR contract_address IS NULL);
-- expect 0

-- Timestamps in a sane window is the cheapest tell that the layout is right.
SELECT count(*) FROM tokens
WHERE minted_at < '2024-01-01' OR minted_at > now() + interval '1 day';
-- expect 0
```

## Switching over

Once the trial looks right, production needs `0014` applied and
`GAME_ADDRESSES` set. Legacy rows are unaffected: they were decoded
correctly when written, `generation` backfills to `'legacy'` by DEFAULT, and
the legacy layout constants are untouched. This is additive — there is no
backfill and no re-index.

The deployed legacy denshokan keeps emitting and keeps being indexed
correctly, indefinitely. Retiring the generation upstream removed the source
code, not the chain state.
