-- password_reset_token was only ever created by a hand-written file
-- (0011_password_reset_tokens.sql) that was never added to the migration journal, so
-- drizzle-kit migrate never ran it: production had no such table and "Forgot password"
-- failed with a 500 on every request, and any database built from migrations alone
-- (a new environment, a disaster-recovery rebuild) would have been missing it too.
-- IF NOT EXISTS keeps this safe on a database where someone created it by hand.
CREATE TABLE IF NOT EXISTS "password_reset_token" (
	"token" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
