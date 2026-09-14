#!/usr/bin/env -S npx tsx
// SmugMug importer (brief section 14 step 2-3). Reads the manifest written by
// export.ts, recreates the folder/gallery hierarchy from each album's SmugMug
// UrlPath, uploads every original to B2, and enqueues the same ingest pipeline normal
// uploads use (derivatives, EXIF, dedup all just work). Also writes the redirects
// table so old SmugMug links 301 to the matching new gallery.
//
// Idempotent: re-running is safe. Assets dedup on sha256 (same as any other upload),
// folders/galleries are find-or-create by parent+slug, and gallery_item/keyword rows
// use onConflictDoNothing.
//
// Imported galleries are left unpublished (publishedAt stays null) regardless of
// visibility -- nothing goes live automatically. Review and publish deliberately from
// /studio once the import is verified.
//
// Usage: docker compose run --rm migrate npx tsx scripts/smugmug-export/import.ts <export-dir>

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import pLimit from "p-limit";
import { db } from "../../src/lib/db";
import { assetKeywords, assets, folders, galleries, galleryItems, keywords, redirects } from "../../src/lib/db/schema";
import { basenameOf, classifyKind } from "../../src/lib/ingest/classify";
import { ingestQueue } from "../../src/lib/queue";
import { headObject, originalKey, putObject } from "../../src/lib/storage";
import { slugify } from "../../src/lib/slug";

// A resumed run re-walks every album from the start (manifest order), so anything
// already fully imported on a prior attempt gets hit again -- without this limit,
// each of those re-uploads a multi-MB file to B2 it doesn't need to, one at a time.
// 6 concurrent uploads matches the "4 in parallel" convention already used for
// multipart parts elsewhere, nudged up slightly since these are whole-file PUTs, not
// chunks of one file competing for the same disk read.
const UPLOAD_CONCURRENCY = 6;

type ExportedImage = {
  imageKey: string;
  filename: string;
  caption: string;
  title: string;
  keywords: string[];
  sha256: string;
  byteSize: number;
  localFile: string;
};

type ExportedAlbum = {
  name: string;
  urlPath: string;
  declaredImageCount: number;
  images: ExportedImage[];
};

type Manifest = { exportedAt: string; nickname: string; albums: ExportedAlbum[] };

/** Finds or creates the folder chain for a "/A/B/C" path, returning the deepest folder id. */
async function ensureFolderPath(segments: string[]): Promise<string> {
  let parentId: string | null = null;
  for (const segment of segments) {
    const slug = slugify(segment);
    const existing: typeof folders.$inferSelect | undefined = await db.query.folders.findFirst({
      where:
        parentId === null
          ? and(isNull(folders.parentId), eq(folders.slug, slug))
          : and(eq(folders.parentId, parentId), eq(folders.slug, slug)),
    });
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const [created]: { id: string }[] = await db
      .insert(folders)
      .values({ parentId, slug, title: segment })
      .returning({ id: folders.id });
    parentId = created.id;
  }
  if (!parentId) throw new Error("empty folder path");
  return parentId;
}

async function ensureGallery(folderId: string, name: string): Promise<{ id: string; created: boolean }> {
  const slug = slugify(name);
  const existing = await db.query.galleries.findFirst({
    where: and(eq(galleries.folderId, folderId), eq(galleries.slug, slug)),
  });
  if (existing) return { id: existing.id, created: false };

  const [created] = await db
    .insert(galleries)
    .values({ folderId, slug, title: name })
    .returning({ id: galleries.id });
  return { id: created.id, created: true };
}

/** Uploads/upserts one image's asset row (concurrency-safe, no gallery ordering
 * concerns) -- the gallery_item insert that depends on position happens afterward,
 * once every image in the album has resolved, so concurrent completion order can
 * never scramble displayed photo order. */
async function uploadAndUpsertAsset(
  image: ExportedImage,
  filesDir: string,
): Promise<{ assetId: string; caption: string | null } | null> {
  const buffer = await readFile(path.join(filesDir, image.localFile));
  const actualSha256 = createHash("sha256").update(buffer).digest("hex");
  if (actualSha256 !== image.sha256) {
    console.warn(`[import] sha256 mismatch for ${image.filename} (${image.imageKey}) -- file may be corrupted, skipping`);
    return null;
  }

  const kind = classifyKind(image.filename);
  if (!kind) {
    console.warn(`[import] unrecognized file type for ${image.filename} -- skipping`);
    return null;
  }

  const ext = path.extname(image.filename).replace(/^\./, "") || "jpg";
  const storageKey = originalKey(actualSha256, ext);
  const mime = kind === "jpeg" ? "image/jpeg" : "application/octet-stream";

  // A resumed run walks every album again from the start, so this file may already
  // be sitting in B2 from an earlier attempt -- HeadObject is a cheap metadata call
  // next to re-uploading a multi-MB file that's already there.
  const existing = await headObject(storageKey);
  if (!existing.exists) {
    await putObject(storageKey, buffer, mime);
  }

  const [asset] = await db
    .insert(assets)
    .values({
      sha256: actualSha256,
      originalFilename: image.filename,
      basename: basenameOf(image.filename),
      byteSize: buffer.length,
      mime,
      kind,
      storageKey,
      status: "pending",
    })
    .onConflictDoUpdate({ target: assets.sha256, set: { sha256: actualSha256 } })
    .returning({ id: assets.id, status: assets.status });

  const alreadyIngested = asset.status !== "pending";
  if (!alreadyIngested) {
    await ingestQueue.add("ingest", {
      assetId: asset.id,
      storageKey,
      originalFilename: image.filename,
      sha256: actualSha256,
      byteSize: buffer.length,
      mime,
    });
  }

  for (const value of image.keywords) {
    const [kw] = await db
      .insert(keywords)
      .values({ value })
      .onConflictDoUpdate({ target: keywords.value, set: { value } })
      .returning({ id: keywords.id });
    await db.insert(assetKeywords).values({ assetId: asset.id, keywordId: kw.id }).onConflictDoNothing();
  }

  return { assetId: asset.id, caption: image.caption || image.title || null };
}

async function main() {
  const exportDir = process.argv[2];
  // Optional --prefix=/Some/Path restricts this run to albums under that UrlPath --
  // used to fast-track a specific branch (e.g. the curated "Public Gallery" section)
  // ahead of the full sequential walk, which processes 642 albums in manifest order
  // and could take a long time to reach any one given branch on its own.
  const prefixArg = process.argv.find((a) => a.startsWith("--prefix="))?.slice("--prefix=".length) ?? null;
  // Optional --publish marks every gallery this run touches as public and published
  // immediately, instead of the normal "land unpublished, review later" default --
  // only makes sense combined with --prefix for a branch already known to be public
  // on the source SmugMug site.
  const shouldPublish = process.argv.includes("--publish");
  if (!exportDir) {
    console.error("Usage: npx tsx scripts/smugmug-export/import.ts <export-dir> [--prefix=/Some/Path] [--publish]");
    process.exit(1);
  }
  const filesDir = path.join(exportDir, "files");
  const manifest = JSON.parse(await readFile(path.join(exportDir, "manifest.json"), "utf-8")) as Manifest;

  const albums = prefixArg ? manifest.albums.filter((a) => a.urlPath.startsWith(prefixArg)) : manifest.albums;
  console.log(
    `[import] ${albums.length} albums from export dated ${manifest.exportedAt}` +
      (prefixArg ? ` (filtered to ${prefixArg})` : ""),
  );

  let totalImported = 0;
  for (const album of albums) {
    const segments = album.urlPath.split("/").filter(Boolean);
    if (segments.length === 0) {
      console.warn(`[import] album "${album.name}" has no UrlPath segments -- skipping`);
      continue;
    }
    const gallerySegment = segments[segments.length - 1];
    const folderSegments = segments.slice(0, -1);

    const folderId = folderSegments.length > 0 ? await ensureFolderPath(folderSegments) : await ensureFolderPath(["imported"]);
    const { id: galleryId } = await ensureGallery(folderId, gallerySegment);

    if (shouldPublish) {
      await db
        .update(galleries)
        .set({ visibility: "public", publishedAt: new Date() })
        .where(eq(galleries.id, galleryId));
    }

    const limit = pLimit(UPLOAD_CONCURRENCY);
    const results = await Promise.all(
      album.images.map((image) => limit(() => uploadAndUpsertAsset(image, filesDir))),
    );

    // Sequential and in original order on purpose -- position has to reflect each
    // image's place in album.images regardless of which upload finished first.
    let position = 0;
    for (const result of results) {
      if (!result) continue;
      await db
        .insert(galleryItems)
        .values({ galleryId, assetId: result.assetId, position, caption: result.caption })
        .onConflictDoNothing();
      position += 1;
      totalImported += 1;
    }

    const newPath = "/" + [...folderSegments.map(slugify), slugify(gallerySegment)].join("/");
    await db
      .insert(redirects)
      .values({ oldPath: album.urlPath, newPath })
      .onConflictDoNothing();

    console.log(`[import] ${album.urlPath} -> ${newPath} (${album.images.length} images)`);
  }

  console.log(`\n[import] done. ${totalImported} images enqueued for ingest across ${albums.length} albums.`);
  console.log(
    shouldPublish
      ? `Imported galleries were published immediately (--publish was set).`
      : `Imported galleries are unpublished -- review and publish from /studio once ingest finishes.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
