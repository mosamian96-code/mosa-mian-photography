import {
  type AnyPgColumn,
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
  // scrypt hash ("salt:hash", both hex) -- see src/lib/password.ts. Replaced the
  // email-magic-link + TOTP flow with plain email/password (decided 2026-08-22: the
  // authenticator step became a real lockout risk with no recovery path for a
  // single-admin site with no one else to grant access back).
  passwordHash: text("passwordHash"),
});

export const passwordResetTokens = pgTable("password_reset_token", {
  token: text("token").primaryKey(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
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
    kind: text("kind", { enum: ["raw", "jpeg", "heic", "sidecar", "video"] }).notNull(),
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

// Phase 3: structure and public site. Folders/galleries are the organizational layer
// on top of Phase 2's assets — an asset can belong to many galleries and is never
// duplicated in storage (brief section 4).

const visibilityValues = ["public", "unlisted", "password", "private"] as const;

export const folders = pgTable(
  "folder",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    parentId: text("parent_id").references((): AnyPgColumn => folders.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    visibility: text("visibility", { enum: visibilityValues }).notNull().default("public"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    unique("folder_parent_slug_unique").on(t.parentId, t.slug),
    index("folder_parent_id_idx").on(t.parentId),
  ],
);

export const galleries = pgTable(
  "gallery",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    folderId: text("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    coverAssetId: text("cover_asset_id").references(() => assets.id, { onDelete: "set null" }),
    visibility: text("visibility", { enum: visibilityValues }).notNull().default("public"),
    passwordHash: text("password_hash"),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    sortMode: text("sort_mode", { enum: ["capture_date", "upload_date", "filename", "manual"] })
      .notNull()
      .default("capture_date"),
    // Null means "use sortMode's own default direction" (newest-first for the two
    // date modes, A-Z for filename/manual) -- an explicit value overrides that. Kept
    // nullable rather than defaulted so this migration doesn't silently reorder any
    // existing gallery's photos.
    sortDirection: text("sort_direction", { enum: ["asc", "desc"] }),
    downloadsPolicy: text("downloads_policy", { enum: ["off", "web", "original"] })
      .notNull()
      .default("off"),
    // Separate from downloadsPolicy above, which is scoped to client-proofing links
    // only (see /api/public/download's own comment) -- this one governs whether an
    // ordinary site visitor who can already view the gallery (public/unlisted/entered
    // the password) can also download from it. Off by default on every gallery.
    publicDownloadsPolicy: text("public_downloads_policy", { enum: ["off", "web", "original"] })
      .notNull()
      .default("off"),
    metaKeywords: text("meta_keywords"),
    // These three default true because the behavior they gate (EXIF line under the
    // photo, the slideshow button, the GPS map) was already unconditional before this
    // column existed -- true preserves every existing gallery's current appearance;
    // showFilenames defaults false because that display didn't exist before at all.
    showCameraInfo: boolean("show_camera_info").notNull().default(true),
    showFilenames: boolean("show_filenames").notNull().default(false),
    slideshowEnabled: boolean("slideshow_enabled").notNull().default(true),
    mapEnabled: boolean("map_enabled").notNull().default(true),
    rightClickMessage: text("right_click_message"),
    // Combined with visibility (see generateMetadata) -- true is a no-op there since a
    // non-public gallery is already noindex regardless; this only matters as an
    // explicit opt-out for an otherwise-public gallery.
    searchable: boolean("searchable").notNull().default(true),
    // References `watermarks`, defined further down this file — forward reference,
    // same AnyPgColumn callback pattern as folders' self-reference above.
    watermarkId: text("watermark_id").references((): AnyPgColumn => watermarks.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { mode: "date" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [unique("gallery_folder_slug_unique").on(t.folderId, t.slug)],
);

export const galleryItems = pgTable(
  "gallery_item",
  {
    galleryId: text("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    caption: text("caption"),
  },
  (t) => [
    primaryKey({ columns: [t.galleryId, t.assetId] }),
    index("gallery_item_gallery_id_idx").on(t.galleryId),
  ],
);

// Phase 4: clients. Token-linked private galleries, favorites, comments,
// watermarking, and the contact form (brief section 9 / section 4).

export const watermarks = pgTable("watermark", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  storageKey: text("storage_key").notNull(),
  position: text("position", {
    enum: ["bottom_right", "bottom_left", "top_right", "top_left", "center", "tile"],
  })
    .notNull()
    .default("bottom_right"),
  opacity: doublePrecision("opacity").notNull().default(0.5),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const clientAccess = pgTable(
  "client_access",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    galleryId: text("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    token: text("token")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID().replace(/-/g, "")),
    email: text("email"),
    passwordHash: text("password_hash"),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    // Per-link, not per-gallery: two clients on the same gallery can have different
    // permissions (brief section 4).
    downloadsEnabled: boolean("downloads_enabled").notNull().default(true),
    canFavorite: boolean("can_favorite").notNull().default(true),
    canComment: boolean("can_comment").notNull().default(true),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("client_access_gallery_id_idx").on(t.galleryId)],
);

export const favorites = pgTable(
  "favorite",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    clientAccessId: text("client_access_id")
      .notNull()
      .references(() => clientAccess.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [unique("favorite_client_asset_unique").on(t.clientAccessId, t.assetId)],
);

export const comments = pgTable(
  "comment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    clientAccessId: text("client_access_id")
      .notNull()
      .references(() => clientAccess.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    readAt: timestamp("read_at", { mode: "date" }),
  },
  (t) => [index("comment_client_access_id_idx").on(t.clientAccessId)],
);

export const contactSubmissions = pgTable("contact_submission", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  readAt: timestamp("read_at", { mode: "date" }),
});

// Phase 5: migration off SmugMug. Old SmugMug URLs -> new gallery/folder paths, so
// links clients already have keep working (brief section 14 step 3).
export const redirects = pgTable("redirect", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  oldPath: text("old_path").notNull().unique(),
  newPath: text("new_path").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Site-wide branding for the real homepage (profile photo, hero photo, tagline, about
// bio, social links) -- singleton row, fixed id enforces there's ever only one.
// profileAssetId/heroAssetId reference existing library assets rather than a separate
// upload path, reusing the same derivative pipeline every other photo goes through.
export const siteSettings = pgTable("site_settings", {
  id: text("id").primaryKey().default("singleton"),
  profileAssetId: text("profile_asset_id").references(() => assets.id, { onDelete: "set null" }),
  heroAssetId: text("hero_asset_id").references(() => assets.id, { onDelete: "set null" }),
  tagline: text("tagline"),
  aboutBio: text("about_bio"),
  socialInstagram: text("social_instagram"),
  socialFacebook: text("social_facebook"),
  socialLinkedin: text("social_linkedin"),
  socialEmail: text("social_email"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});
