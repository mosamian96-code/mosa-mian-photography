CREATE TABLE "asset_group" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_keyword" (
	"asset_id" text NOT NULL,
	"keyword_id" text NOT NULL,
	CONSTRAINT "asset_keyword_asset_id_keyword_id_pk" PRIMARY KEY("asset_id","keyword_id")
);
--> statement-breakpoint
CREATE TABLE "asset_metadata" (
	"asset_id" text PRIMARY KEY NOT NULL,
	"camera" text,
	"lens" text,
	"iso" integer,
	"shutter" text,
	"aperture" text,
	"focal_length" text,
	"gps_lat" double precision,
	"gps_lon" double precision,
	"raw_exif" jsonb
);
--> statement-breakpoint
CREATE TABLE "asset" (
	"id" text PRIMARY KEY NOT NULL,
	"sha256" text NOT NULL,
	"original_filename" text NOT NULL,
	"basename" text NOT NULL,
	"batch_id" text,
	"byte_size" bigint NOT NULL,
	"mime" text NOT NULL,
	"kind" text NOT NULL,
	"width" integer,
	"height" integer,
	"captured_at" timestamp,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	"storage_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"lqip" text,
	"group_id" text,
	"is_group_primary" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "asset_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
CREATE TABLE "derivative" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"variant" text NOT NULL,
	"format" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"storage_key" text NOT NULL,
	"watermarked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "derivative_asset_id_variant_format_watermarked_unique" UNIQUE("asset_id","variant","format","watermarked")
);
--> statement-breakpoint
CREATE TABLE "import_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"total_files" integer DEFAULT 0 NOT NULL,
	"completed_files" integer DEFAULT 0 NOT NULL,
	"failed_files" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text,
	"batch_id" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword" (
	"id" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "keyword_value_unique" UNIQUE("value")
);
--> statement-breakpoint
ALTER TABLE "asset_keyword" ADD CONSTRAINT "asset_keyword_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_keyword" ADD CONSTRAINT "asset_keyword_keyword_id_keyword_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keyword"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_metadata" ADD CONSTRAINT "asset_metadata_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_batch_id_import_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_group_id_asset_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."asset_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derivative" ADD CONSTRAINT "derivative_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_batch_id_import_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_captured_at_idx" ON "asset" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "asset_group_id_idx" ON "asset" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "asset_batch_basename_idx" ON "asset" USING btree ("batch_id","basename");