CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"repo" text,
	"url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"detected_country_code" text,
	"brand_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_items_key_unique" UNIQUE("key")
);
--> statement-breakpoint
DROP INDEX "integration_brand_kind_idx";--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "vercel_project_id" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "github_repo" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_items" ADD CONSTRAINT "sync_items_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_brand_kind_idx" ON "integration_snapshots" USING btree ("brand_id","kind");--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_vercel_project_id_unique" UNIQUE("vercel_project_id");--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_github_repo_unique" UNIQUE("github_repo");