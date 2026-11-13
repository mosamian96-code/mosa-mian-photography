CREATE TABLE "client_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"client_access_id" text NOT NULL,
	"gallery_id" text NOT NULL,
	"kind" text NOT NULL,
	"asset_id" text,
	"size" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_activity" ADD CONSTRAINT "client_activity_client_access_id_client_access_id_fk" FOREIGN KEY ("client_access_id") REFERENCES "public"."client_access"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_activity" ADD CONSTRAINT "client_activity_gallery_id_gallery_id_fk" FOREIGN KEY ("gallery_id") REFERENCES "public"."gallery"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_activity" ADD CONSTRAINT "client_activity_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_activity_link_created_idx" ON "client_activity" USING btree ("client_access_id","created_at");--> statement-breakpoint
CREATE INDEX "client_activity_gallery_created_idx" ON "client_activity" USING btree ("gallery_id","created_at");