-- Fix WebSocket NOTIFY payloads: cast numeric/bigint fields to text
-- so JavaScript JSON.parse doesn't lose precision on large felt252 token IDs.
--
-- PostgreSQL json_build_object serializes numeric/bigint as JSON numbers,
-- but JavaScript Number only supports ~16 significant digits. Starknet
-- token IDs (felt252) can be up to 78 digits, causing silent precision loss.

CREATE OR REPLACE FUNCTION notify_score_update()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('score_updates', json_build_object(
        'token_id', NEW.token_id::text,
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
        'game_id', NEW.game_id,
        'owner_address', NEW.owner_address,
        'minted_by', NEW.minted_by,
        'settings_id', NEW.settings_id,
        'context_id', NEW.context_id,
        'objective_id', NEW.objective_id
    )::text);
    PERFORM pg_notify('token_updates', json_build_object(
        'token_id', NEW.token_id::text,
        'game_id', NEW.game_id,
        'type', 'minted',
        'owner_address', NEW.owner_address
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
