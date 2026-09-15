-- password_reset_token is intentionally not created here even though drizzle-kit's
-- diff included it: that table was already added by a hand-written migration
-- (0011_password_reset_tokens.sql) that predates this repo's journal/snapshot
-- history being in sync, and it already exists in both the local and production
-- databases. Re-creating it here would fail with "already exists". This file adds
-- only what's actually new.
CREATE TABLE "error_log" (
	"id" text PRIMARY KEY NOT NULL,
	"context" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "error_log_created_at_idx" ON "error_log" USING btree ("created_at");