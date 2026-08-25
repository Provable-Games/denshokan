-- Carry contract_address in the WebSocket NOTIFY payloads.
--
-- Two things in these payloads stopped being self-describing once more than
-- one token contract is indexed:
--
--   * `token_id` alone no longer identifies a token. Identity is
--     (contract_address, token_id) — see 0015.
--   * `minted_by` is a per-contract minter id, so a subscriber filtering on a
--     minter address would otherwise also receive another contract's tokens
--     whose minter id happens to match the same number.
--
-- `game_id` is kept and stays null for self-bound tokens; contract_address is
-- the field that identifies the game for those.
--
-- Redefinitions only — the triggers themselves are unchanged, and every
-- existing payload field keeps its name and type.

CREATE OR REPLACE FUNCTION notify_score_update()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('score_updates', json_build_object(
        'token_id', NEW.token_id::text,
        'contract_address', NEW.contract_address,
        'game_id', NEW.game_id,
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
        'game_id', NEW.game_id,
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
            'game_id', NEW.game_id,
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
            'game_id', NEW.game_id,
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
        'game_id', NEW.game_id,
        'owner_address', NEW.owner_address,
        'minted_by', NEW.minted_by,
        'settings_id', NEW.settings_id,
        'context_id', NEW.context_id,
        'objective_id', NEW.objective_id
    )::text);
    PERFORM pg_notify('token_updates', json_build_object(
        'token_id', NEW.token_id::text,
        'contract_address', NEW.contract_address,
        'game_id', NEW.game_id,
        'type', 'minted',
        'owner_address', NEW.owner_address
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
