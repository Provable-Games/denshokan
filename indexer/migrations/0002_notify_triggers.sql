-- Notify trigger functions for real-time WebSocket updates via PostgreSQL LISTEN/NOTIFY

-- Score updates (on INSERT to score_history or UPDATE to tokens.current_score)
CREATE OR REPLACE FUNCTION notify_score_update()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('score_updates', json_build_object(
        'token_id', NEW.token_id,
        'game_id', NEW.game_id,
        'score', NEW.current_score,
        'owner_address', NEW.owner_address,
        'player_name', NEW.player_name
    )::text);
    PERFORM pg_notify('token_updates', json_build_object(
        'token_id', NEW.token_id,
        'game_id', NEW.game_id,
        'type', 'score_update',
        'score', NEW.current_score
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Game over events
CREATE OR REPLACE FUNCTION notify_game_over()
RETURNS trigger AS $$
BEGIN
    IF NEW.game_over = true AND (OLD.game_over IS NULL OR OLD.game_over = false) THEN
        PERFORM pg_notify('game_over_events', json_build_object(
            'token_id', NEW.token_id,
            'game_id', NEW.game_id,
            'score', NEW.current_score,
            'owner_address', NEW.owner_address,
            'player_name', NEW.player_name,
            'completed_all_objectives', NEW.completed_all_objectives
        )::text);
        PERFORM pg_notify('token_updates', json_build_object(
            'token_id', NEW.token_id,
            'game_id', NEW.game_id,
            'type', 'game_over',
            'score', NEW.current_score
        )::text);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- New token minted
CREATE OR REPLACE FUNCTION notify_token_minted()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('new_tokens', json_build_object(
        'token_id', NEW.token_id,
        'game_id', NEW.game_id,
        'owner_address', NEW.owner_address,
        'minted_by', NEW.minted_by,
        'settings_id', NEW.settings_id
    )::text);
    PERFORM pg_notify('token_updates', json_build_object(
        'token_id', NEW.token_id,
        'game_id', NEW.game_id,
        'type', 'minted',
        'owner_address', NEW.owner_address
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER score_update_notify
    AFTER UPDATE OF current_score ON tokens
    FOR EACH ROW
    WHEN (OLD.current_score IS DISTINCT FROM NEW.current_score)
    EXECUTE FUNCTION notify_score_update();

CREATE TRIGGER game_over_notify
    AFTER UPDATE OF game_over ON tokens
    FOR EACH ROW
    EXECUTE FUNCTION notify_game_over();

CREATE TRIGGER token_minted_notify
    AFTER INSERT ON tokens
    FOR EACH ROW
    EXECUTE FUNCTION notify_token_minted();
