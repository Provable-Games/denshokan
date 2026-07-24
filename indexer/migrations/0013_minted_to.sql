-- Original mint recipient. `owner_address` follows the asset through
-- transfers; `minted_to` is pinned to the Transfer-from-0x0 recipient so
-- consumers (e.g. score-based Discord role gates) can distinguish "earned by
-- this wallet" from "currently held by this wallet" without per-token RPC
-- event lookups.
--
-- Nullable ADD COLUMN with no default: metadata-only on Postgres (no table
-- rewrite, no long lock) — safe on the production database. Existing rows
-- stay NULL until scripts/backfill-minted-to.ts fills them from the chain's
-- mint events (one linear keyed event scan; updates only NULL rows).

ALTER TABLE "tokens" ADD COLUMN IF NOT EXISTS "minted_to" text;
