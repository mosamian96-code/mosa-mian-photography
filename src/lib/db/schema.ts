import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Auth.js (Drizzle adapter) tables. Shape is dictated by @auth/drizzle-adapter/lib/pg —
// column names must match exactly for the adapter's built-in queries to work.
// Single-admin app: `account` exists only because the adapter type requires it (email
// magic-link sign-in never writes a row here; it's dead weight until an OAuth provider,
// if ever, is added).
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // TOTP second factor. Base32 secret lives directly on the user row rather than a
  // separate table: there is exactly one admin account, so the extra join buys nothing.
  mfaSecret: text("mfaSecret"),
  mfaEnabledAt: timestamp("mfaEnabledAt", { mode: "date" }),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// Everything below is app schema, not adapter schema.

// Phase-1-only table: proves the migration pipeline and the health check round-trip
// (api/health writes a row, reads it back, deletes it) without inventing throwaway SQL.
export const healthChecks = pgTable("health_check", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  checkedAt: timestamp("checked_at", { mode: "date" }).notNull().defaultNow(),
  storageOk: boolean("storage_ok").notNull(),
  redisOk: boolean("redis_ok").notNull(),
});

// The full section 4 data model (folders, galleries, assets, derivatives, ...) is
// introduced in Phase 2 and beyond, one vertical slice at a time, per PROJECT_BRIEF.md
// section 19 ("show me the schema before implementing against them"). Nothing here yet.
