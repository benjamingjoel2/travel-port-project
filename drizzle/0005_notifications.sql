ALTER TABLE "team_members" ADD COLUMN "notifications_seen_at" timestamp with time zone;--> statement-breakpoint
-- Start everyone at "all read" so past history does not flood the bell.
UPDATE "team_members" SET "notifications_seen_at" = now();
