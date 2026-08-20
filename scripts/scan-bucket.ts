#!/usr/bin/env -S npx tsx
// Admin "scan bucket" job (brief section 6): finds objects under originals/ with no
// matching asset row -- the other half of the rclone bulk-import path, for anything
// over ~200GB that goes straight into B2 rather than through the browser (documented
// in docs/bulk-import.md).
//
// rclone drops files wherever the source drive's structure puts them, not at our
// sha256-addressed canonical path, so every orphan found here gets downloaded (to
// hash), server-side copied to its canonical originals/{yyyy}/{mm}/{sha256}.{ext} key,
// and the old arbitrary-path object deleted -- then it's just a normal pending asset,
// ingested the same way any other upload is.
//
// Usage: docker compose run --rm migrate npx tsx scripts/scan-bucket.ts

import { createHash } from "node:crypto";
import path from "node:path";
import { db } from "../src/lib/db";
import { assets } from "../src/lib/db/schema";
import { basenameOf, classifyKind } from "../src/lib/ingest/classify";
import { ingestQueue } from "../src/lib/queue";
import { copyObject, deleteObject, getObjectBuffer, listObjectKeys, originalKey } from "../src/lib/storage";

async function main() {
  console.log("[scan-bucket] listing originals/...");
  const allKeys = await listObjectKeys("originals/");
  console.log(`[scan-bucket] ${allKeys.length} objects under originals/`);

  const existing = await db.query.assets.findMany({ columns: { storageKey: true } });
  const knownKeys = new Set(existing.map((a) => a.storageKey));

  const orphans = allKeys.filter((key) => !knownKeys.has(key));
  console.log(`[scan-bucket] ${orphans.length} orphan object(s) with no asset row`);

  let imported = 0;
  let skipped = 0;
  for (const key of orphans) {
    const filename = path.basename(key);
    const kind = classifyKind(filename);
    if (!kind) {
      console.warn(`[scan-bucket] ${key}: unrecognized file type, skipping`);
      skipped += 1;
      continue;
    }

    console.log(`[scan-bucket] hashing ${key}...`);
    const buffer = await getObjectBuffer(key);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const ext = path.extname(filename).replace(/^\./, "") || "bin";
    const canonicalKey = originalKey(sha256, ext);

    if (canonicalKey !== key) {
      await copyObject(key, canonicalKey);
      await deleteObject(key);
    }

    const [asset] = await db
      .insert(assets)
      .values({
        sha256,
        originalFilename: filename,
        basename: basenameOf(filename),
        byteSize: buffer.length,
        mime: kind === "jpeg" ? "image/jpeg" : kind === "heic" ? "image/heic" : "application/octet-stream",
        kind,
        storageKey: canonicalKey,
        status: "pending",
      })
      .onConflictDoUpdate({ target: assets.sha256, set: { sha256 } })
      .returning({ id: assets.id, status: assets.status });

    if (asset.status === "pending") {
      await ingestQueue.add("ingest", {
        assetId: asset.id,
        storageKey: canonicalKey,
        originalFilename: filename,
        sha256,
        byteSize: buffer.length,
        mime: kind === "jpeg" ? "image/jpeg" : kind === "heic" ? "image/heic" : "application/octet-stream",
      });
      imported += 1;
      console.log(`[scan-bucket] imported ${filename} (${sha256.slice(0, 12)}...)`);
    } else {
      console.log(`[scan-bucket] ${filename} already ingested elsewhere (dedup) -- old object removed, no new asset`);
    }
  }

  console.log(`\n[scan-bucket] done. ${imported} imported, ${skipped} skipped (unrecognized type).`);
  console.log(`New assets land in /studio/library unsorted, same as any other upload -- add them to galleries from there.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
