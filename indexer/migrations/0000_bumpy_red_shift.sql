CREATE TABLE "game_leaderboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" integer NOT NULL,
	"token_id" bigint NOT NULL,
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
	"avg_score" numeric(20, 2),
	"high_score" bigint,
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
	"image_url" text,
	"created_at" timestamp DEFAULT now(),
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
CREATE TABLE "score_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" bigint NOT NULL,
	"score" bigint NOT NULL,
	"block_number" bigint NOT NULL,
	"block_timestamp" timestamp NOT NULL,
	"transaction_hash" text NOT NULL,
	"event_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" bigint NOT NULL,
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
	"token_id" bigint NOT NULL,
	"game_id" integer NOT NULL,
	"minted_by" bigint NOT NULL,
	"settings_id" integer NOT NULL,
	"minted_at" timestamp NOT NULL,
	"lifecycle_start" integer DEFAULT 0 NOT NULL,
	"lifecycle_end" integer DEFAULT 0 NOT NULL,
	"objectives_count" smallint DEFAULT 0 NOT NULL,
	"soulbound" boolean DEFAULT false NOT NULL,
	"has_context" boolean DEFAULT false NOT NULL,
	"sequence_number" bigint NOT NULL,
	"game_over" boolean DEFAULT false NOT NULL,
	"completed_all_objectives" boolean DEFAULT false NOT NULL,
	"owner_address" text NOT NULL,
	"player_name" text,
	"client_url" text,
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
CREATE UNIQUE INDEX "score_history_block_tx_event_idx" ON "score_history" USING btree ("block_number","transaction_hash","event_index");--> statement-breakpoint
CREATE INDEX "score_history_token_block_idx" ON "score_history" USING btree ("token_id","block_number");--> statement-breakpoint
CREATE INDEX "score_history_token_time_idx" ON "score_history" USING btree ("token_id","block_timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "token_events_block_tx_event_idx" ON "token_events" USING btree ("block_number","transaction_hash","event_index");--> statement-breakpoint
CREATE INDEX "token_events_token_idx" ON "token_events" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "token_events_token_time_idx" ON "token_events" USING btree ("token_id","block_timestamp");--> statement-breakpoint
CREATE INDEX "token_events_type_idx" ON "token_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "token_events_time_idx" ON "token_events" USING btree ("block_timestamp");--> statement-breakpoint
CREATE INDEX "tokens_game_score_idx" ON "tokens" USING btree ("game_id","current_score");--> statement-breakpoint
CREATE INDEX "tokens_game_active_idx" ON "tokens" USING btree ("game_id","game_over");--> statement-breakpoint
CREATE INDEX "tokens_owner_idx" ON "tokens" USING btree ("owner_address");--> statement-breakpoint
CREATE INDEX "tokens_owner_game_idx" ON "tokens" USING btree ("owner_address","game_id");--> statement-breakpoint
CREATE INDEX "tokens_updated_idx" ON "tokens" USING btree ("last_updated_at");--> statement-breakpoint
CREATE INDEX "tokens_sequence_idx" ON "tokens" USING btree ("sequence_number");--> statement-breakpoint
CREATE INDEX "tokens_minted_by_idx" ON "tokens" USING btree ("minted_by");--> statement-breakpoint
CREATE INDEX "tokens_settings_idx" ON "tokens" USING btree ("settings_id");