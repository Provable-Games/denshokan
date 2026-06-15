-- Dirty-marker block for the URI fetcher (fixes lost-update race).
--
-- The indexer (on every ERC-4906 MetadataUpdate) sets
-- `token_uri_fetched = false` to enqueue a refetch, while the standalone
-- fetch-token-uris.ts process later sets it back to true after pulling
-- token_uri over RPC. Those two writes raced: a fetch issued mid-game
-- (game_over still false) could land *after* the indexer's game-over reset,
-- clobbering it — pinning game_over = false forever so a finished game keeps
-- showing as active.
--
-- `metadata_update_block` records the block of the most recent MetadataUpdate.
-- The fetcher snapshots this value before its RPC call and only marks the
-- token clean if the column hasn't advanced past the snapshot, so a stale
-- result can no longer overwrite a newer dirty state.
--
-- Existing rows default to 0; any subsequent MetadataUpdate sets a real block.
-- To reconcile already-stuck tokens, re-enqueue ones that may be wrongly
-- "active" (run once, out of band — triggers a one-time RPC refetch burst):
--   UPDATE tokens
--   SET token_uri_fetched = false
--   WHERE game_over = false AND token_uri_fetch_failed = false;

ALTER TABLE "tokens"
  ADD COLUMN "metadata_update_block" bigint NOT NULL DEFAULT 0;
