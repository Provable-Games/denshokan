CREATE TABLE "game_leaderboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" integer NOT NULL,
	"token_id" numeric NOT NULL,
	"owner_address" text NOT NULL,
	"player_name" text,
	"score" bigint NOT NULL,
	"rank" integer NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "game_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" integer NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"completed_games" integer DEFAULT 0 NOT NULL,
	"active_games" integer DEFAULT 0 NOT NULL,
	"unique_players" integer DEFAULT 0 NOT NULL,
	"last_updated" timestamp DEFAULT now(),
	CONSTRAINT "game_stats_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" integer NOT NULL,
	"contract_address" text NOT NULL,
	"name" text,
	"description" text,
	"image" text,
	"developer" text,
	"publisher" text,
	"genre" text,
	"color" text,
	"client_url" text,
	"renderer_address" text,
	"royalty_fraction" numeric,
	"created_at" timestamp DEFAULT now(),
	"last_updated_block" bigint,
	"last_updated_at" timestamp DEFAULT now(),
	CONSTRAINT "games_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
CREATE TABLE "minters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"minter_id" bigint NOT NULL,
	"contract_address" text NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now(),
	"block_number" bigint NOT NULL,
	CONSTRAINT "minters_minter_id_unique" UNIQUE("minter_id")
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_address" text NOT NULL,
	"objective_id" integer NOT NULL,
	"settings_id" integer DEFAULT 0 NOT NULL,
	"creator_address" text NOT NULL,
	"objective_data" text,
	"name" text,
	"description" text,
	"objectives" jsonb,
	"block_number" bigint NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "score_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" numeric NOT NULL,
	"score" bigint NOT NULL,
	"block_number" bigint NOT NULL,
	"block_timestamp" timestamp NOT NULL,
	"transaction_hash" text NOT NULL,
	"event_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_address" text NOT NULL,
	"settings_id" integer NOT NULL,
	"creator_address" text NOT NULL,
	"settings_data" text,
	"name" text,
	"description" text,
	"settings" jsonb,
	"block_number" bigint NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "token_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" numeric NOT NULL,
	"event_type" text NOT NULL,
	"event_data" text NOT NULL,
	"block_number" bigint NOT NULL,
	"block_timestamp" timestamp NOT NULL,
	"transaction_hash" text NOT NULL,
	"event_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" numeric NOT NULL,
	"game_id" integer NOT NULL,
	"minted_by" bigint NOT NULL,
	"settings_id" integer NOT NULL,
	"minted_at" timestamp NOT NULL,
	"start_delay" integer DEFAULT 0 NOT NULL,
	"end_delay" integer DEFAULT 0 NOT NULL,
	"objective_id" integer DEFAULT 0 NOT NULL,
	"soulbound" boolean DEFAULT false NOT NULL,
	"has_context" boolean DEFAULT false NOT NULL,
	"paymaster" boolean DEFAULT false NOT NULL,
	"tx_hash" integer DEFAULT 0 NOT NULL,
	"salt" integer DEFAULT 0 NOT NULL,
	"metadata" integer DEFAULT 0 NOT NULL,
	"game_over" boolean DEFAULT false NOT NULL,
	"completed_all_objectives" boolean DEFAULT false NOT NULL,
	"owner_address" text NOT NULL,
	"player_name" text,
	"client_url" text,
	"context_data" jsonb,
	"context_id" integer,
	"renderer_address" text,
	"current_score" bigint NOT NULL,
	"created_at_block" bigint NOT NULL,
	"last_updated_block" bigint NOT NULL,
	"last_updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tokens_token_id_unique" UNIQUE("token_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "game_leaderboards_game_rank_idx" ON "game_leaderboards" USING btree ("game_id","rank");--> statement-breakpoint
CREATE INDEX "game_leaderboards_token_idx" ON "game_leaderboards" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "game_leaderboards_game_score_idx" ON "game_leaderboards" USING btree ("game_id","score");--> statement-breakpoint
CREATE INDEX "games_contract_idx" ON "games" USING btree ("contract_address");--> statement-breakpoint
CREATE INDEX "minters_contract_idx" ON "minters" USING btree ("contract_address");--> statement-breakpoint
CREATE UNIQUE INDEX "objectives_game_objective_idx" ON "objectives" USING btree ("game_address","objective_id");--> statement-breakpoint
CREATE INDEX "objectives_settings_idx" ON "objectives" USING btree ("game_address","settings_id");--> statement-breakpoint
CREATE UNIQUE INDEX "score_history_block_tx_event_idx" ON "score_history" USING btree ("block_number","transaction_hash","event_index");--> statement-breakpoint
CREATE INDEX "score_history_token_block_idx" ON "score_history" USING btree ("token_id","block_number");--> statement-breakpoint
CREATE INDEX "score_history_token_time_idx" ON "score_history" USING btree ("token_id","block_timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_game_settings_idx" ON "settings" USING btree ("game_address","settings_id");--> statement-breakpoint
CREATE UNIQUE INDEX "token_events_block_tx_event_idx" ON "token_events" USING btree ("block_number","transaction_hash","event_index");--> statement-breakpoint
CREATE INDEX "token_events_token_idx" ON "token_events" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "token_events_token_time_idx" ON "token_events" USING btree ("token_id","block_timestamp");--> statement-breakpoint
CREATE INDEX "token_events_type_time_idx" ON "token_events" USING btree ("event_type","block_timestamp");--> statement-breakpoint
CREATE INDEX "token_events_time_idx" ON "token_events" USING btree ("block_timestamp");--> statement-breakpoint
CREATE INDEX "tokens_game_score_idx" ON "tokens" USING btree ("game_id","current_score");--> statement-breakpoint
CREATE INDEX "tokens_game_over_updated_idx" ON "tokens" USING btree ("game_id","game_over","last_updated_at");--> statement-breakpoint
CREATE INDEX "tokens_owner_updated_idx" ON "tokens" USING btree ("owner_address","last_updated_at");--> statement-breakpoint
CREATE INDEX "tokens_owner_game_idx" ON "tokens" USING btree ("owner_address","game_id");--> statement-breakpoint
CREATE INDEX "tokens_objective_idx" ON "tokens" USING btree ("objective_id");--> statement-breakpoint
CREATE INDEX "tokens_minted_by_idx" ON "tokens" USING btree ("minted_by");--> statement-breakpoint
CREATE INDEX "tokens_settings_idx" ON "tokens" USING btree ("settings_id");--> statement-breakpoint
CREATE INDEX "tokens_context_id_idx" ON "tokens" USING btree ("context_id");--> statement-breakpoint

-- Notify trigger functions for real-time WebSocket updates via PostgreSQL LISTEN/NOTIFY

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
$$ LANGUAGE plpgsql;--> statement-breakpoint

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
$$ LANGUAGE plpgsql;--> statement-breakpoint

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
$$ LANGUAGE plpgsql;--> statement-breakpoint

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

DROP TRIGGER IF EXISTS score_update_notify ON tokens;
CREATE TRIGGER score_update_notify
    AFTER UPDATE OF current_score ON tokens
    FOR EACH ROW
    WHEN (OLD.current_score IS DISTINCT FROM NEW.current_score)
    EXECUTE FUNCTION notify_score_update();--> statement-breakpoint

DROP TRIGGER IF EXISTS game_over_notify ON tokens;
CREATE TRIGGER game_over_notify
    AFTER UPDATE OF game_over ON tokens
    FOR EACH ROW
    EXECUTE FUNCTION notify_game_over();--> statement-breakpoint

DROP TRIGGER IF EXISTS token_minted_notify ON tokens;
CREATE TRIGGER token_minted_notify
    AFTER INSERT ON tokens
    FOR EACH ROW
    EXECUTE FUNCTION notify_token_minted();--> statement-breakpoint

DROP TRIGGER IF EXISTS new_game_notify ON games;
CREATE TRIGGER new_game_notify
    AFTER INSERT ON games
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_game();--> statement-breakpoint

DROP TRIGGER IF EXISTS new_minter_notify ON minters;
CREATE TRIGGER new_minter_notify
    AFTER INSERT ON minters
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_minter();--> statement-breakpoint

DROP TRIGGER IF EXISTS new_setting_notify ON settings;
CREATE TRIGGER new_setting_notify
    AFTER INSERT ON settings
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_setting();--> statement-breakpoint

DROP TRIGGER IF EXISTS new_objective_notify ON objectives;
CREATE TRIGGER new_objective_notify
    AFTER INSERT ON objectives
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_objective();
