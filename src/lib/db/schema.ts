import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
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

// Phase 2: ingest and library. Folders/galleries (section 4) are Phase 3 — assets exist
// independently of any gallery until then, per "an asset can appear in many galleries;
// it is stored once."

// Links a RAW to its JPEG sibling and any .xmp sidecar so they display as one library
// item (section 4 "asset_groups"). One row per RAW+JPEG[+XMP] cluster; membership and
// the "which one represents the group in the grid" flag live on `assets` itself.
export const assetGroups = pgTable("asset_group", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const assets = pgTable(
  "asset",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sha256: text("sha256").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    // Filename without directory or extension, computed at insert time — indexed so
    // the ingest worker can find RAW+JPEG+XMP siblings (same batch, same basename)
    // with a direct query instead of scanning every asset in the batch in JS.
    basename: text("basename").notNull(),
    batchId: text("batch_id").references(() => importBatches.id, { onDelete: "set null" }),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    mime: text("mime").notNull(),
    kind: text("kind", { enum: ["raw", "jpeg", "heic", "sidecar"] }).notNull(),
    width: integer("width"),
    height: integer("height"),
    capturedAt: timestamp("captured_at", { mode: "date" }),
    importedAt: timestamp("imported_at", { mode: "date" }).notNull().defaultNow(),
    storageKey: text("storage_key").notNull(),
    status: text("status", { enum: ["pending", "processing", "ready", "failed"] })
      .notNull()
      .default("pending"),
    errorMessage: text("error_message"),
    lqip: text("lqip"),
    groupId: text("group_id").references(() => assetGroups.id, { onDelete: "set null" }),
    isGroupPrimary: boolean("is_group_primary").notNull().default(false),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (t) => [
    index("asset_captured_at_idx").on(t.capturedAt),
    index("asset_group_id_idx").on(t.groupId),
    index("asset_batch_basename_idx").on(t.batchId, t.basename),
  ],
);

export const assetMetadata = pgTable("asset_metadata", {
  assetId: text("asset_id")
    .primaryKey()
    .references(() => assets.id, { onDelete: "cascade" }),
  camera: text("camera"),
  lens: text("lens"),
  iso: integer("iso"),
  shutter: text("shutter"),
  aperture: text("aperture"),
  focalLength: text("focal_length"),
  gpsLat: doublePrecision("gps_lat"),
  gpsLon: doublePrecision("gps_lon"),
  rawExif: jsonb("raw_exif"),
});

export const derivatives = pgTable(
  "derivative",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    variant: text("variant").notNull(),
    format: text("format").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    storageKey: text("storage_key").notNull(),
    watermarked: boolean("watermarked").notNull().default(false),
  },
  (t) => [unique().on(t.assetId, t.variant, t.format, t.watermarked)],
);

export const keywords = pgTable("keyword", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  value: text("value").notNull().unique(),
});

export const assetKeywords = pgTable(
  "asset_keyword",
  {
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    keywordId: text("keyword_id")
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.keywordId] })],
);

export const importBatches = pgTable("import_batch", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  totalFiles: integer("total_files").notNull().default(0),
  completedFiles: integer("completed_files").notNull().default(0),
  failedFiles: integer("failed_files").notNull().default(0),
  status: text("status", { enum: ["uploading", "processing", "done", "failed"] })
    .notNull()
    .default("uploading"),
});

// Mirrors BullMQ job state into Postgres so the admin upload monitor (brief section 12)
// can be queried directly, without reaching into Redis from a page/route handler.
export const jobs = pgTable("job", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  assetId: text("asset_id").references(() => assets.id, { onDelete: "cascade" }),
  batchId: text("batch_id").references(() => importBatches.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  status: text("status", { enum: ["queued", "active", "completed", "failed"] })
    .notNull()
    .default("queued"),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});
