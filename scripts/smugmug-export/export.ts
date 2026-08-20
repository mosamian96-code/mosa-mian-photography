#!/usr/bin/env -S npx tsx
// SmugMug exporter (brief section 14 step 1). Walks every album in the account via
// the flat `!albumlist` endpoint (its UrlPath already encodes the full folder
// hierarchy as a string, so there's no need to separately recurse the Node tree),
// downloads every image at full original resolution, and writes a manifest recording
// title/caption/keywords/gallery membership plus each image's original SmugMug URL
// (for the redirect map, built later by import.ts).
//
// Resumable: re-running skips any image already recorded as downloaded in
// progress.json, so a multi-day run surviving a restart just picks back up.
// Rate-limited: see scripts/smugmug-export/client.ts.
//
// Usage: npx tsx scripts/smugmug-export/export.ts <output-dir>

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { credsFromEnv, type OAuthCredentials } from "./oauth";
import { smugmugDownload, smugmugGet } from "./client";

const API_BASE = "https://api.smugmug.com";

type SmugAlbum = {
  Name: string;
  UrlPath: string;
  AlbumKey: string;
  ImageCount: number;
  Description?: string;
};

type SmugAlbumImage = {
  FileName: string;
  Caption?: string;
  Title?: string;
  Keywords?: string;
  ImageKey: string;
  ArchivedUri?: string;
  Uris?: { ImageDownload?: { Uri: string } };
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

async function getOriginalDownloadUrl(image: SmugAlbumImage, creds: OAuthCredentials): Promise<string | null> {
  if (image.Uris?.ImageDownload) {
    try {
      const res = await smugmugGet<{ Response: { ImageDownload: { Url: string } } }>(
        `${API_BASE}${image.Uris.ImageDownload.Uri}`,
        creds,
      );
      return res.Response.ImageDownload.Url;
    } catch (err) {
      console.warn(`[export] ImageDownload lookup failed for ${image.ImageKey}, falling back: ${err}`);
    }
  }
  return image.ArchivedUri ?? null;
}

async function exportAlbum(
  album: SmugAlbum,
  filesDir: string,
  creds: OAuthCredentials,
  progress: Progress,
): Promise<ExportedAlbum> {
  const images: ExportedImage[] = [];
  let start = 1;
  const pageSize = 100;

  for (;;) {
    const page = await smugmugGet<{
      Response: { AlbumImage?: SmugAlbumImage[]; Pages: { Total: number } };
    }>(`${API_BASE}/api/v2/album/${album.AlbumKey}!images?start=${start}&count=${pageSize}`, creds);

    const items = page.Response.AlbumImage ?? [];
    for (const img of items) {
      const existing = progress.downloadedImageKeys[img.ImageKey];
      if (existing) {
        images.push(existing);
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

  return { name: album.Name, urlPath: album.UrlPath, declaredImageCount: album.ImageCount, images };
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("Usage: npx tsx scripts/smugmug-export/export.ts <output-dir>");
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

  const albums: ExportedAlbum[] = [];
  let start = 1;
  const pageSize = 100;
  for (;;) {
    const page = await smugmugGet<{
      Response: { AlbumList?: SmugAlbum[]; Pages: { Total: number } };
    }>(`${API_BASE}/api/v2/folder/user/${nickname}!albumlist?start=${start}&count=${pageSize}`, creds);

    const items = page.Response.AlbumList ?? [];
    for (const album of items) {
      console.log(`[export] album: ${album.UrlPath} (${album.ImageCount} images declared)`);
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
  console.log(`  Images downloaded: ${totalImages} (SmugMug declared ${declaredTotal} across all albums)`);
  console.log(`  Total bytes: ${totalBytes.toLocaleString()} (${(totalBytes / 1e9).toFixed(2)} GB)`);
  if (totalImages !== declaredTotal) {
    console.log(
      `  ⚠ Mismatch: ${declaredTotal - totalImages} image(s) declared by SmugMug were not downloaded (see [export] warnings above). Investigate before trusting this export.`,
    );
  }
  console.log(`\nNext: cross-check these totals against SmugMug's own account overview, then run:`);
  console.log(`  npx tsx scripts/smugmug-export/import.ts ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
