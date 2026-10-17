ALTER TABLE "notes" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "done_by_id" uuid;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_done_by_id_team_members_id_fk" FOREIGN KEY ("done_by_id") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;