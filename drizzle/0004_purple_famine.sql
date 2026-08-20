CREATE TABLE "redirect" (
	"id" text PRIMARY KEY NOT NULL,
	"old_path" text NOT NULL,
	"new_path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "redirect_old_path_unique" UNIQUE("old_path")
);
