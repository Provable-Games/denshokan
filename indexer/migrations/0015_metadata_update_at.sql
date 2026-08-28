-- Block timestamp of the most recent MetadataUpdate, to recover `completed_at`.
--
-- `completed_at` has been null on every self-bound token. The previous
-- generation's SHARED token contract latched a completion time during
-- `update_game`; the self-bound token removed that machinery ("ask the game")
-- and reports completed_at as 0 unconditionally — but no entrypoint was added
-- to ask with. So the field simply stopped being recorded anywhere.
--
-- A game emits MetadataUpdate when its state changes, so the timestamp of the
-- update that carried the completion is the chain time of completion. The
-- indexer already has the block header, so recording it adds no RPC and no
-- event subscription.
--
-- Nullable with no default: rows written before this column existed have no
-- honest value for it, and 0 would be indistinguishable from "the epoch".
-- Tokens that complete after deploy get a real timestamp; older ones stay
-- null, which is what the URI already reported for them.
ALTER TABLE "tokens"
  ADD COLUMN "metadata_update_at" integer;
