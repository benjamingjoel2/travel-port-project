CREATE TYPE "public"."brand_type" AS ENUM('country', 'region', 'niche');--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "brand_type" "brand_type" DEFAULT 'country' NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "markets_covered" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Existing brands are all single-country brands: their market is their own country.
UPDATE "brands" SET "markets_covered" = jsonb_build_array("country") WHERE "brand_type" = 'country' AND "markets_covered" = '[]'::jsonb AND "country" <> '';
