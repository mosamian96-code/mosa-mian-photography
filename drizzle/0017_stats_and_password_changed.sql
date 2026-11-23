CREATE TABLE IF NOT EXISTS "gallery_daily_stat" (
	"gallery_id" text NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "gallery_daily_stat_gallery_id_day_pk" PRIMARY KEY("gallery_id","day")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "passwordChangedAt" timestamp;--> statement-breakpoint
ALTER TABLE "gallery_daily_stat" ADD CONSTRAINT "gallery_daily_stat_gallery_id_gallery_id_fk" FOREIGN KEY ("gallery_id") REFERENCES "public"."gallery"("id") ON DELETE cascade ON UPDATE no action;