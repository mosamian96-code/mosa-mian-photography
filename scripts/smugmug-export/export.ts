#!/usr/bin/env -S npx tsx
// SmugMug exporter (brief section 14 step 1). Walks every album in the account via
// the flat `!albumlist` endpoint (its UrlPath already encodes the full folder
// hierarchy as a string, so there's no need to separately recurse the Node tree),
// downloads every image at full original resolution, and writes a manifest recording
// title/caption/keywords/gallery membership plus each image's original SmugMug URL
// (for the redirect map, built later by import.ts).
//
// Field names below were corrected against this account's real API responses, not
// guessed from docs: `!albumlist` only returns {Uri, UrlPath, Name} -- no AlbumKey or
// ImageCount, unlike some community client examples assume. AlbumKey comes from
// parsing Uri ("/api/v2/album/6QV6jP" -> "6QV6jP"); the declared image count comes
// from the first `!images` page's Pages.Total instead of an extra per-album request.
// The real download field is `ArchivedUri` directly on each AlbumImage (confirmed to
// be true original resolution for an account with MaxPhotoDownloadSize=Original,
// where ArchivedSize == OriginalSize) -- there is no Uris.ImageDownload field at all.
//
// Resumable: re-running skips any image already recorded as downloaded in
// progress.json, so a multi-day run surviving a restart just picks back up.
// Rate-limited: see scripts/smugmug-export/client.ts.
//
// Usage: npx tsx scripts/smugmug-export/export.ts <output-dir> [exclude-prefix,...]
//   e.g. npx tsx scripts/smugmug-export/export.ts /e/smugmug-export /Android-Auto-Upload,/Android-Backup

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { classifyKind } from "../../src/lib/ingest/classify";
import { credsFromEnv, type OAuthCredentials } from "./oauth";
import { smugmugDownload, smugmugGet } from "./client";

const API_BASE = "https://api.smugmug.com";

type SmugAlbumSummary = { Uri: string; Name: string; UrlPath: string };

type SmugAlbumImage = {
  FileName: string;
  Caption?: string;
  Title?: string;
  Keywords?: string;
  ImageKey: string;
  ArchivedUri?: string;
  Uris?: { LargestImage?: { Uri: string } };
};

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
  urlPath: string; // e.g. "/Weddings/Smith-Wedding" -- also this gallery's old SmugMug URL path
  declaredImageCount: number;
  images: ExportedImage[];
};

type Manifest = {
  exportedAt: string;
  nickname: string;
  albums: ExportedAlbum[];
};

type Progress = { downloadedImageKeys: Record<string, ExportedImage> };

async function loadJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function albumKeyFromUri(uri: string): string {
  return uri.split("/").filter(Boolean).pop() ?? "";
}

async function getOriginalDownloadUrl(image: SmugAlbumImage, creds: OAuthCredentials): Promise<string | null> {
  if (image.ArchivedUri) return image.ArchivedUri;
  if (image.Uris?.LargestImage) {
    try {
      const res = await smugmugGet<{ Response: { LargestImage: { Url: string } } }>(
        `${API_BASE}${image.Uris.LargestImage.Uri}`,
        creds,
      );
      return res.Response.LargestImage.Url;
    } catch (err) {
      console.warn(`[export] LargestImage lookup failed for ${image.ImageKey}: ${err}`);
    }
  }
  return null;
}

async function exportAlbum(
  album: SmugAlbumSummary,
  filesDir: string,
  creds: OAuthCredentials,
  progress: Progress,
): Promise<ExportedAlbum> {
  const albumKey = albumKeyFromUri(album.Uri);
  const images: ExportedImage[] = [];
  let declaredImageCount = 0;
  let start = 1;
  const pageSize = 100;

  for (;;) {
    const page = await smugmugGet<{
      Response: { AlbumImage?: SmugAlbumImage[]; Pages: { Total: number } };
    }>(`${API_BASE}/api/v2/album/${albumKey}!images?start=${start}&count=${pageSize}`, creds);
    declaredImageCount = page.Response.Pages.Total;

    const items = page.Response.AlbumImage ?? [];
    for (const img of items) {
      const existing = progress.downloadedImageKeys[img.ImageKey];
      if (existing) {
        images.push(existing);
        continue;
      }

      // Videos and anything else this system doesn't ingest (brief section 1: "not
      // building video hosting") -- skip before downloading, not after, so bandwidth
      // and the external drive's space aren't spent on files that can never be used.
      if (!classifyKind(img.FileName)) {
        console.log(`[export] skipping unsupported file type: ${album.Name}/${img.FileName}`);
        continue;
      }

      const downloadUrl = await getOriginalDownloadUrl(img, creds);
      if (!downloadUrl) {
        console.warn(`[export] no download URL for ${album.Name}/${img.FileName} (${img.ImageKey}) -- skipped`);
        continue;
      }

      const buffer = await smugmugDownload(downloadUrl, creds);
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const localFile = `${img.ImageKey}-${img.FileName}`.replace(/[^\w.\-]/g, "_");
      await writeFile(path.join(filesDir, localFile), buffer);

      const exported: ExportedImage = {
        imageKey: img.ImageKey,
        filename: img.FileName,
        caption: img.Caption ?? "",
        title: img.Title ?? "",
        keywords: (img.Keywords ?? "")
          .split(/[,;]/)
          .map((k) => k.trim())
          .filter(Boolean),
        sha256,
        byteSize: buffer.length,
        localFile,
      };
      images.push(exported);
      progress.downloadedImageKeys[img.ImageKey] = exported;
      console.log(`[export] downloaded ${album.Name}/${img.FileName} (${(buffer.length / 1e6).toFixed(1)}MB)`);
    }

    if (start + pageSize > page.Response.Pages.Total) break;
    start += pageSize;
  }

  return { name: album.Name, urlPath: album.UrlPath, declaredImageCount, images };
}

async function main() {
  const outDir = process.argv[2];
  const excludePrefixes = (process.argv[3] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!outDir) {
    console.error("Usage: npx tsx scripts/smugmug-export/export.ts <output-dir> [exclude-prefix,...]");
    process.exit(1);
  }
  const filesDir = path.join(outDir, "files");
  await mkdir(filesDir, { recursive: true });

  const creds = credsFromEnv();
  const progressFile = path.join(outDir, "progress.json");
  const progress = await loadJson<Progress>(progressFile, { downloadedImageKeys: {} });

  const authUser = await smugmugGet<{ Response: { User: { NickName: string } } }>(
    `${API_BASE}/api/v2!authuser`,
    creds,
  );
  const nickname = authUser.Response.User.NickName;
  console.log(`[export] authenticated as ${nickname}`);
  if (excludePrefixes.length > 0) console.log(`[export] excluding: ${excludePrefixes.join(", ")}`);

  const albums: ExportedAlbum[] = [];
  let start = 1;
  const pageSize = 100;
  for (;;) {
    const page = await smugmugGet<{
      Response: { AlbumList?: SmugAlbumSummary[]; Pages: { Total: number } };
    }>(`${API_BASE}/api/v2/folder/user/${nickname}!albumlist?start=${start}&count=${pageSize}`, creds);

    const items = page.Response.AlbumList ?? [];
    for (const album of items) {
      if (excludePrefixes.some((p) => album.UrlPath === p || album.UrlPath.startsWith(p + "/"))) {
        console.log(`[export] excluded: ${album.UrlPath}`);
        continue;
      }
      console.log(`[export] album: ${album.UrlPath}`);
      const exported = await exportAlbum(album, filesDir, creds, progress);
      albums.push(exported);
      // Persist progress after every album, not just at the very end -- a crash
      // mid-run should lose at most one album's partial progress, not everything.
      await writeFile(progressFile, JSON.stringify(progress, null, 2));
    }

    if (start + pageSize > page.Response.Pages.Total) break;
    start += pageSize;
  }

  const manifest: Manifest = { exportedAt: new Date().toISOString(), nickname, albums };
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  const totalImages = albums.reduce((n, a) => n + a.images.length, 0);
  const declaredTotal = albums.reduce((n, a) => n + a.declaredImageCount, 0);
  const totalBytes = albums.reduce((n, a) => n + a.images.reduce((m, i) => m + i.byteSize, 0), 0);

  console.log(`\n[export] done.`);
  console.log(`  Albums: ${albums.length}`);
  console.log(`  Images downloaded: ${totalImages} (SmugMug declared ${declaredTotal} across all albums, before filtering unsupported file types)`);
  console.log(`  Total bytes: ${totalBytes.toLocaleString()} (${(totalBytes / 1e9).toFixed(2)} GB)`);
  console.log(`\nNext: cross-check these totals against SmugMug's own account overview, then run:`);
  console.log(`  npx tsx scripts/smugmug-export/import.ts ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
