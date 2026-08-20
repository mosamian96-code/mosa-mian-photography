CREATE TABLE "site_settings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"profile_asset_id" text,
	"hero_asset_id" text,
	"tagline" text,
	"about_bio" text,
	"social_instagram" text,
	"social_facebook" text,
	"social_email" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_profile_asset_id_asset_id_fk" FOREIGN KEY ("profile_asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_hero_asset_id_asset_id_fk" FOREIGN KEY ("hero_asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;