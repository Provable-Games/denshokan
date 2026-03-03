ALTER TABLE "tokens" ADD COLUMN "token_uri" text;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "token_uri_fetched" boolean DEFAULT false NOT NULL;
