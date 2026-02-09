-- Notify trigger functions for new settings and objectives via PostgreSQL LISTEN/NOTIFY

CREATE OR REPLACE FUNCTION notify_new_setting()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('new_settings', json_build_object(
        'game_address', NEW.game_address,
        'settings_id', NEW.settings_id,
        'creator_address', NEW.creator_address,
        'settings_data', NEW.settings_data
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION notify_new_objective()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('new_objectives', json_build_object(
        'game_address', NEW.game_address,
        'objective_id', NEW.objective_id,
        'creator_address', NEW.creator_address,
        'objective_data', NEW.objective_data
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER new_setting_notify
    AFTER INSERT ON settings
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_setting();--> statement-breakpoint

CREATE TRIGGER new_objective_notify
    AFTER INSERT ON objectives
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_objective();
