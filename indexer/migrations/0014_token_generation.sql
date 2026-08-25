-- Support indexing the self-bound token generation (game-components v2.x)
-- alongside the registry-backed denshokan.
--
-- The two generations pack token ids with layouts that share no offsets, and
-- the id carries no marker saying which is which. `generation` records the
-- layout a row was decoded with, so a row can be re-read or re-derived later
-- without guessing.
--
-- All four statements are metadata-only on Postgres — no table rewrite, no
-- long lock — with the exception noted on metadata below.

-- Which layout decoded this row. Existing rows are all legacy: it is the only
-- generation this indexer could see before v2.x, so the DEFAULT backfills
-- them correctly without an UPDATE.
ALTER TABLE "tokens" ADD COLUMN IF NOT EXISTS "generation" text NOT NULL DEFAULT 'legacy';

-- The contract that emitted the mint. For legacy this is the single
-- denshokan; for a self-bound game it IS the game's identity, which is what
-- replaces game_id below. Nullable: existing rows are filled by their known
-- contract, or left null and inferred from generation='legacy'.
ALTER TABLE "tokens" ADD COLUMN IF NOT EXISTS "contract_address" text;

-- game_id is legacy-only. A standard token is self-bound — the game IS the
-- token contract — so there is no game id in the layout to decode. Dropping
-- NOT NULL is metadata-only; existing values are untouched.
ALTER TABLE "tokens" ALTER COLUMN "game_id" DROP NOT NULL;

-- metadata widens from 13 bits (legacy) to 65 (standard), which overflows
-- int4 and exceeds JS Number.MAX_SAFE_INTEGER.
--
-- NOTE: unlike the statements above, this one REWRITES the table — int4 and
-- numeric have different storage. On a large tokens table run it in a
-- maintenance window, or do it online with the add-backfill-swap pattern
-- (add metadata_numeric, backfill in batches, swap). It is written as a
-- straight ALTER here because the type change must not be silently skipped:
-- leaving it as int4 would make wide standard values fail on insert, which is
-- at least loud, but only after a standard game is already being indexed.
ALTER TABLE "tokens" ALTER COLUMN "metadata" TYPE numeric USING "metadata"::numeric;
ALTER TABLE "tokens" ALTER COLUMN "metadata" SET DEFAULT 0;

-- Queries will filter by generation once both are indexed (e.g. "all standard
-- tokens for this game"), and by contract for the self-bound case where the
-- contract is the game.
CREATE INDEX IF NOT EXISTS "tokens_generation_idx" ON "tokens" ("generation");
CREATE INDEX IF NOT EXISTS "tokens_contract_address_idx" ON "tokens" ("contract_address");
