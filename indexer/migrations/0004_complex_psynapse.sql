ALTER TABLE "objectives" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "objectives" jsonb;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "settings" jsonb;