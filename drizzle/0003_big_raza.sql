CREATE TABLE "client_access" (
	"id" text PRIMARY KEY NOT NULL,
	"gallery_id" text NOT NULL,
	"token" text NOT NULL,
	"email" text,
	"password_hash" text,
	"expires_at" timestamp,
	"downloads_enabled" boolean DEFAULT true NOT NULL,
	"can_favorite" boolean DEFAULT true NOT NULL,
	"can_comment" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_access_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" text PRIMARY KEY NOT NULL,
	"client_access_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "contact_submission" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "favorite" (
	"id" text PRIMARY KEY NOT NULL,
	"client_access_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_client_asset_unique" UNIQUE("client_access_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "watermark" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"storage_key" text NOT NULL,
	"position" text DEFAULT 'bottom_right' NOT NULL,
	"opacity" double precision DEFAULT 0.5 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gallery" ADD COLUMN "watermark_id" text;--> statement-breakpoint
ALTER TABLE "client_access" ADD CONSTRAINT "client_access_gallery_id_gallery_id_fk" FOREIGN KEY ("gallery_id") REFERENCES "public"."gallery"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_client_access_id_client_access_id_fk" FOREIGN KEY ("client_access_id") REFERENCES "public"."client_access"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_client_access_id_client_access_id_fk" FOREIGN KEY ("client_access_id") REFERENCES "public"."client_access"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_access_gallery_id_idx" ON "client_access" USING btree ("gallery_id");--> statement-breakpoint
CREATE INDEX "comment_client_access_id_idx" ON "comment" USING btree ("client_access_id");--> statement-breakpoint
ALTER TABLE "gallery" ADD CONSTRAINT "gallery_watermark_id_watermark_id_fk" FOREIGN KEY ("watermark_id") REFERENCES "public"."watermark"("id") ON DELETE set null ON UPDATE no action;