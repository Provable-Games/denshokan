-- Retarget the schema at the self-bound token generation (game-components v2.x).
--
-- Every game is now its own ERC721. There is no registry, no shared denshokan
-- token contract, and no numeric game id — a game IS a contract address. This
-- migration reshapes the legacy schema accordingly.
--
-- The new deployment starts from an empty database, so there is no data to
-- preserve and no backfill: these statements exist to bring a database created
-- by 0000–0013 to the shape the indexer now writes.

-- ---------------------------------------------------------------------------
-- tokens
-- ---------------------------------------------------------------------------

-- The issuing contract IS the game, and is half the token's identity.
ALTER TABLE "tokens" ADD COLUMN IF NOT EXISTS "contract_address" text;
DELETE FROM "tokens" WHERE "contract_address" IS NULL;
ALTER TABLE "tokens" ALTER COLUMN "contract_address" SET NOT NULL;

-- game_id was a registry id packed into the legacy layout. The current layout
-- has no such field.
ALTER TABLE "tokens" DROP COLUMN IF EXISTS "game_id";

-- metadata widens from 13 bits to 65, which overflows int4 and exceeds
-- JS Number.MAX_SAFE_INTEGER.
ALTER TABLE "tokens" ALTER COLUMN "metadata" TYPE numeric USING "metadata"::numeric;
ALTER TABLE "tokens" ALTER COLUMN "metadata" SET DEFAULT 0;

-- Token identity is (contract, id). A token id is unique only within the
-- ERC721 that issued it: the layout carries nothing distinguishing one game
-- from another, and its collision protection (10-bit tx_hash + 16-bit client
-- salt) is transaction-scoped, so two games minting in the same multicall can
-- pack byte-identical ids. Under the old global constraint the second mint
-- would silently UPDATE the first game's row instead of inserting its own.
ALTER TABLE "tokens" DROP CONSTRAINT IF EXISTS "tokens_token_id_unique";
DROP INDEX IF EXISTS "tokens_token_id_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "tokens_contract_token_idx"
  ON "tokens" ("contract_address", "token_id");

-- Indexes that were keyed on game_id are re-keyed on the contract.
DROP INDEX IF EXISTS "tokens_game_score_idx";
DROP INDEX IF EXISTS "tokens_game_over_updated_idx";
DROP INDEX IF EXISTS "tokens_owner_game_idx";
CREATE INDEX IF NOT EXISTS "tokens_game_score_idx"
  ON "tokens" ("contract_address", "current_score");
CREATE INDEX IF NOT EXISTS "tokens_game_over_updated_idx"
  ON "tokens" ("contract_address", "game_over", "last_updated_at");
CREATE INDEX IF NOT EXISTS "tokens_owner_game_idx"
  ON "tokens" ("owner_address", "contract_address");

-- ---------------------------------------------------------------------------
-- minters
-- ---------------------------------------------------------------------------

-- `minter_counter` is per-contract storage in the token component, so every
-- game independently assigns minter_id 1 to its own first minter. Under a
-- global unique constraint the second game's registration would overwrite the
-- first's, and minter resolution would then return the wrong address.
--
-- Note this is NOT the same column as contract_address, which is the minter's
-- own address — the one it is easily confused with.
ALTER TABLE "minters" ADD COLUMN IF NOT EXISTS "token_contract_address" text;
DELETE FROM "minters" WHERE "token_contract_address" IS NULL;
ALTER TABLE "minters" ALTER COLUMN "token_contract_address" SET NOT NULL;

ALTER TABLE "minters" DROP CONSTRAINT IF EXISTS "minters_minter_id_unique";
DROP INDEX IF EXISTS "minters_minter_id_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "minters_token_contract_minter_idx"
  ON "minters" ("token_contract_address", "minter_id");

-- ---------------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------------

-- A game IS its contract, so that is its identity. Rows used to arrive from
-- registry events; they are now upserted by the URI fetcher, which parses the
-- game's name/developer/publisher/genre and image out of a token URI — the
-- only place v2.x exposes them, since there is no registry and no
-- `game_metadata()` entrypoint.
ALTER TABLE "games" DROP CONSTRAINT IF EXISTS "games_game_id_unique";
DROP INDEX IF EXISTS "games_game_id_unique";
ALTER TABLE "games" DROP COLUMN IF EXISTS "game_id";
CREATE UNIQUE INDEX IF NOT EXISTS "games_contract_address_idx"
  ON "games" ("contract_address");

-- ---------------------------------------------------------------------------
-- WebSocket NOTIFY payloads
-- ---------------------------------------------------------------------------

-- token_id alone no longer identifies a token, and game_id no longer exists,
-- so every payload carries contract_address instead.

CREATE OR REPLACE FUNCTION notify_score_update()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('score_updates', json_build_object(
        'token_id', NEW.token_id::text,
        'contract_address', NEW.contract_address,
        'score', NEW.current_score::text,
        'owner_address', NEW.owner_address,
        'player_name', NEW.player_name,
        'context_id', NEW.context_id,
        'minted_by', NEW.minted_by,
        'settings_id', NEW.settings_id,
        'objective_id', NEW.objective_id
    )::text);
    PERFORM pg_notify('token_updates', json_build_object(
        'token_id', NEW.token_id::text,
        'contract_address', NEW.contract_address,
        'type', 'score_update',
        'score', NEW.current_score::text
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION notify_game_over()
RETURNS trigger AS $$
BEGIN
    IF NEW.game_over = true AND (OLD.game_over IS NULL OR OLD.game_over = false) THEN
        PERFORM pg_notify('game_over_events', json_build_object(
            'token_id', NEW.token_id::text,
            'contract_address', NEW.contract_address,
            'score', NEW.current_score::text,
            'owner_address', NEW.owner_address,
            'player_name', NEW.player_name,
            'completed_all_objectives', NEW.completed_all_objectives,
            'context_id', NEW.context_id,
            'minted_by', NEW.minted_by,
            'settings_id', NEW.settings_id,
            'objective_id', NEW.objective_id
        )::text);
        PERFORM pg_notify('token_updates', json_build_object(
            'token_id', NEW.token_id::text,
            'contract_address', NEW.contract_address,
            'type', 'game_over',
            'score', NEW.current_score::text
        )::text);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION notify_token_minted()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('new_tokens', json_build_object(
        'token_id', NEW.token_id::text,
        'contract_address', NEW.contract_address,
        'owner_address', NEW.owner_address,
        'minted_by', NEW.minted_by,
        'settings_id', NEW.settings_id,
        'context_id', NEW.context_id,
        'objective_id', NEW.objective_id
    )::text);
    PERFORM pg_notify('token_updates', json_build_object(
        'token_id', NEW.token_id::text,
        'contract_address', NEW.contract_address,
        'type', 'minted',
        'owner_address', NEW.owner_address
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

-- new_games previously carried the registry's numeric id.
CREATE OR REPLACE FUNCTION notify_new_game()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('new_games', json_build_object(
        'contract_address', NEW.contract_address,
        'name', NEW.name
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
