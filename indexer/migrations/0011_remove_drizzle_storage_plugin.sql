CREATE TABLE "indexer_cursor" (
	"id" text PRIMARY KEY NOT NULL,
	"order_key" bigint NOT NULL,
	"unique_key" text
);
--> statement-breakpoint
-- Seed the new cursor row from airfoil.checkpoints if the previous indexer
-- (using @apibara/plugin-drizzle) was running here. Idempotent and safe on
-- fresh installs where the airfoil schema doesn't exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'airfoil' AND table_name = 'checkpoints'
  ) THEN
    INSERT INTO "indexer_cursor" ("id", "order_key", "unique_key")
    SELECT 'denshokan', "order_key", "unique_key"
    FROM "airfoil"."checkpoints"
    WHERE "id" = 'indexer_denshokan_denshokan'
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;
