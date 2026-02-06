-- Notify trigger functions for new games and minters via PostgreSQL LISTEN/NOTIFY

CREATE OR REPLACE FUNCTION notify_new_game()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('new_games', json_build_object(
        'game_id', NEW.game_id,
        'contract_address', NEW.contract_address,
        'name', NEW.name
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION notify_new_minter()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('new_minters', json_build_object(
        'minter_id', NEW.minter_id,
        'contract_address', NEW.contract_address,
        'name', NEW.name,
        'block_number', NEW.block_number
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER new_game_notify
    AFTER INSERT ON games
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_game();--> statement-breakpoint

CREATE TRIGGER new_minter_notify
    AFTER INSERT ON minters
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_minter();
