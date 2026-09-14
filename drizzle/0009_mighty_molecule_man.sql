ALTER TABLE "gallery" ADD COLUMN "sort_direction" text;--> statement-breakpoint
ALTER TABLE "gallery" ADD COLUMN "public_downloads_policy" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "gallery" ADD COLUMN "meta_keywords" text;--> statement-breakpoint
ALTER TABLE "gallery" ADD COLUMN "show_camera_info" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "gallery" ADD COLUMN "show_filenames" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gallery" ADD COLUMN "slideshow_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "gallery" ADD COLUMN "map_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "gallery" ADD COLUMN "right_click_message" text;--> statement-breakpoint
ALTER TABLE "gallery" ADD COLUMN "searchable" boolean DEFAULT true NOT NULL;