DROP INDEX "token_events_type_idx";--> statement-breakpoint
DROP INDEX "tokens_game_active_idx";--> statement-breakpoint
DROP INDEX "tokens_owner_idx";--> statement-breakpoint
DROP INDEX "tokens_updated_idx";--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "settings_id" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "objectives_settings_idx" ON "objectives" USING btree ("game_address","settings_id");--> statement-breakpoint
CREATE INDEX "token_events_type_time_idx" ON "token_events" USING btree ("event_type","block_timestamp");--> statement-breakpoint
CREATE INDEX "tokens_game_over_updated_idx" ON "tokens" USING btree ("game_id","game_over","last_updated_at");--> statement-breakpoint
CREATE INDEX "tokens_owner_updated_idx" ON "tokens" USING btree ("owner_address","last_updated_at");