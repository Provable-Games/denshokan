ALTER TABLE "tokens" ADD COLUMN "completed_at" integer;
CREATE INDEX "tokens_completed_at_idx" ON "tokens" ("completed_at");
ALTER TABLE "tokens" DROP COLUMN "context_data";
ALTER TABLE "tokens" ADD COLUMN "context_name" text;
