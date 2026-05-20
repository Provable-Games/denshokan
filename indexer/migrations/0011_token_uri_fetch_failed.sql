-- Permanent-failure flag for the URI fetcher.
--
-- The standalone fetch-token-uris.ts script polls for tokens with
-- `token_uri_fetched = false` and retries them in-process up to
-- MAX_RETRIES with backoff per call. If those retries are exhausted
-- the failure is essentially deterministic — the same on-chain state
-- on the next poll will revert the same way — so retrying across
-- poll cycles wastes RPC budget without changing the outcome.
--
-- This migration adds `token_uri_fetch_failed` (true after the
-- in-process burst gives up) and `token_uri_fetch_last_error`
-- (last RPC error for triage). The fetcher excludes
-- `token_uri_fetch_failed = true` tokens from its work queue.
--
-- To re-attempt (e.g. after a game-contract upgrade fixes the
-- underlying revert):
--   UPDATE tokens
--   SET token_uri_fetch_failed = false,
--       token_uri_fetch_last_error = NULL
--   WHERE token_uri_fetch_failed = true AND game_id = <X>;

ALTER TABLE "tokens"
  ADD COLUMN "token_uri_fetch_failed" boolean NOT NULL DEFAULT false,
  ADD COLUMN "token_uri_fetch_last_error" text;
