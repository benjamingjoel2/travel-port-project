CREATE TYPE "public"."planned_status" AS ENUM('not_started', 'up_next', 'skipped');--> statement-breakpoint
CREATE TABLE "planned_countries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" text NOT NULL,
	"label" text,
	"wave" integer DEFAULT 1 NOT NULL,
	"note" text,
	"status" "planned_status" DEFAULT 'not_started' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planned_countries_country_code_unique" UNIQUE("country_code")
);
