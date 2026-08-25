-- Scope token and minter identity to the contract that issued them.
--
-- The legacy denshokan was ONE ERC721, so a token id was globally unique and
-- a minter id was globally meaningful. The self-bound generation indexes many
-- ERC721s, and both assumptions break:
--
--   * A standard token id has no game_id. Its collision protection is a
--     10-bit tx_hash plus a 16-bit client salt, both transaction-scoped, so
--     two game contracts minting in the same multicall can pack byte-identical
--     ids. Under a global unique constraint the second mint would silently
--     UPDATE the first game's row instead of inserting its own.
--
--   * `minter_counter` is per-contract storage in the token component, so
--     every self-bound game independently assigns minter_id 1 to its first
--     minter. Under a global unique constraint the second game's registration
--     would overwrite the first's, and minter resolution would then return the
--     wrong address for those tokens.
--
-- Both are latent until a second contract is indexed, and neither throws when
-- it happens — the rows just quietly become wrong. Hence identity by
-- (contract, id).
--
-- NULLS NOT DISTINCT is what makes this need no backfill. Rows written before
-- these columns existed have NULL for the contract, and Postgres would
-- normally treat every NULL as distinct — which would drop deduplication for
-- exactly the historical rows that relied on it. NULLS NOT DISTINCT keeps all
-- of them in one namespace, so they collide on the id alone precisely as they
-- did under the old constraint. Requires Postgres 15+ (we run 16).

-- Tokens: identity is (contract_address, token_id).
ALTER TABLE "tokens" DROP CONSTRAINT IF EXISTS "tokens_token_id_unique";
DROP INDEX IF EXISTS "tokens_token_id_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "tokens_contract_token_idx"
  ON "tokens" ("contract_address", "token_id") NULLS NOT DISTINCT;

-- Minters: the namespace a minter_id lives in is the token contract that
-- emitted the registration. Distinct from contract_address, which is the
-- minter's own address — the column this one is easily confused with.
ALTER TABLE "minters" ADD COLUMN IF NOT EXISTS "token_contract_address" text;

ALTER TABLE "minters" DROP CONSTRAINT IF EXISTS "minters_minter_id_unique";
DROP INDEX IF EXISTS "minters_minter_id_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "minters_token_contract_minter_idx"
  ON "minters" ("token_contract_address", "minter_id") NULLS NOT DISTINCT;
