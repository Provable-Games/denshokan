ALTER TABLE "objectives" ADD COLUMN IF NOT EXISTS "settings_id" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "objectives_settings_idx" ON "objectives" USING btree ("game_address","settings_id");--> statement-breakpoint
DROP INDEX IF EXISTS "token_events_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tokens_game_active_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tokens_owner_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tokens_updated_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "token_events_type_time_idx" ON "token_events" USING btree ("event_type","block_timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tokens_game_over_updated_idx" ON "tokens" USING btree ("game_id","game_over","last_updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tokens_owner_updated_idx" ON "tokens" USING btree ("owner_address","last_updated_at");
