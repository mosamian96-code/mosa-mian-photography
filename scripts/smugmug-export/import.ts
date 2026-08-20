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
import { db } from "../../src/lib/db";
import { assetKeywords, assets, folders, galleries, galleryItems, keywords, redirects } from "../../src/lib/db/schema";
import { basenameOf, classifyKind } from "../../src/lib/ingest/classify";
import { ingestQueue } from "../../src/lib/queue";
import { originalKey, putObject } from "../../src/lib/storage";
import { slugify } from "../../src/lib/slug";

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

async function importImage(
  image: ExportedImage,
  filesDir: string,
  galleryId: string,
  position: number,
): Promise<{ imported: boolean }> {
  const buffer = await readFile(path.join(filesDir, image.localFile));
  const actualSha256 = createHash("sha256").update(buffer).digest("hex");
  if (actualSha256 !== image.sha256) {
    console.warn(`[import] sha256 mismatch for ${image.filename} (${image.imageKey}) -- file may be corrupted, skipping`);
    return { imported: false };
  }

  const kind = classifyKind(image.filename);
  if (!kind) {
    console.warn(`[import] unrecognized file type for ${image.filename} -- skipping`);
    return { imported: false };
  }

  const ext = path.extname(image.filename).replace(/^\./, "") || "jpg";
  const storageKey = originalKey(actualSha256, ext);
  await putObject(storageKey, buffer, kind === "jpeg" ? "image/jpeg" : "application/octet-stream");

  const [asset] = await db
    .insert(assets)
    .values({
      sha256: actualSha256,
      originalFilename: image.filename,
      basename: basenameOf(image.filename),
      byteSize: buffer.length,
      mime: kind === "jpeg" ? "image/jpeg" : "application/octet-stream",
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
      mime: kind === "jpeg" ? "image/jpeg" : "application/octet-stream",
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

  const caption = image.caption || image.title || null;
  await db
    .insert(galleryItems)
    .values({ galleryId, assetId: asset.id, position, caption })
    .onConflictDoNothing();

  return { imported: true };
}

async function main() {
  const exportDir = process.argv[2];
  if (!exportDir) {
    console.error("Usage: npx tsx scripts/smugmug-export/import.ts <export-dir>");
    process.exit(1);
  }
  const filesDir = path.join(exportDir, "files");
  const manifest = JSON.parse(await readFile(path.join(exportDir, "manifest.json"), "utf-8")) as Manifest;

  console.log(`[import] ${manifest.albums.length} albums from export dated ${manifest.exportedAt}`);

  let totalImported = 0;
  for (const album of manifest.albums) {
    const segments = album.urlPath.split("/").filter(Boolean);
    if (segments.length === 0) {
      console.warn(`[import] album "${album.name}" has no UrlPath segments -- skipping`);
      continue;
    }
    const gallerySegment = segments[segments.length - 1];
    const folderSegments = segments.slice(0, -1);

    const folderId = folderSegments.length > 0 ? await ensureFolderPath(folderSegments) : await ensureFolderPath(["imported"]);
    const { id: galleryId } = await ensureGallery(folderId, gallerySegment);

    let position = 0;
    for (const image of album.images) {
      const { imported } = await importImage(image, filesDir, galleryId, position);
      if (imported) {
        position += 1;
        totalImported += 1;
      }
    }

    const newPath = "/" + [...folderSegments.map(slugify), slugify(gallerySegment)].join("/");
    await db
      .insert(redirects)
      .values({ oldPath: album.urlPath, newPath })
      .onConflictDoNothing();

    console.log(`[import] ${album.urlPath} -> ${newPath} (${album.images.length} images)`);
  }

  console.log(`\n[import] done. ${totalImported} images enqueued for ingest across ${manifest.albums.length} albums.`);
  console.log(`Imported galleries are unpublished -- review and publish from /studio once ingest finishes.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
