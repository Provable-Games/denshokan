ALTER TABLE "games" RENAME COLUMN "image_url" TO "image";--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "developer" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "publisher" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "genre" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "client_url" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "renderer_address" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "royalty_fraction" numeric;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "last_updated_block" bigint;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "last_updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "tokens" ALTER COLUMN "token_id" SET DATA TYPE numeric USING "token_id"::numeric;--> statement-breakpoint
ALTER TABLE "score_history" ALTER COLUMN "token_id" SET DATA TYPE numeric USING "token_id"::numeric;--> statement-breakpoint
ALTER TABLE "token_events" ALTER COLUMN "token_id" SET DATA TYPE numeric USING "token_id"::numeric;--> statement-breakpoint
ALTER TABLE "game_leaderboards" ALTER COLUMN "token_id" SET DATA TYPE numeric USING "token_id"::numeric;
