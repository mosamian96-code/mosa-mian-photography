ALTER TABLE "client_access" ADD COLUMN "sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "client_access" ADD COLUMN "sent_to" text;--> statement-breakpoint
ALTER TABLE "client_access" ADD COLUMN "expiry_reminder_sent_at" timestamp;