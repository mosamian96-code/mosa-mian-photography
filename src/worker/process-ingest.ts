import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { exiftool } from "exiftool-vendored";
import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { assetGroups, assetKeywords, assetMetadata, assets, derivatives, keywords } from "@/lib/db/schema";
import { extOf } from "@/lib/ingest/classify";
import { generateLqip, generatePublicDerivatives } from "@/lib/ingest/derivative";
import { derivativeKey, getObjectBuffer, putObject } from "@/lib/storage";
import type { IngestJobData } from "@/lib/queue";

function normalizeKeywords(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return [...new Set(list.map((k) => k.trim()).filter(Boolean))];
}

async function extractRasterBuffer(kind: string, tempPath: string, originalBuffer: Buffer): Promise<Buffer | null> {
  if (kind === "jpeg" || kind === "heic") return originalBuffer;
  if (kind === "sidecar") return null;

  // RAW: never demosaic. The camera-embedded preview carries the in-camera color
  // profile and is the right proxy (brief section 7), extracted via exiftool rather
  // than decoded from the raw sensor data.
  try {
    return await exiftool.extractBinaryTagToBuffer("JpgFromRaw", tempPath);
  } catch {
    return await exiftool.extractBinaryTagToBuffer("PreviewImage", tempPath);
  }
}

async function linkSiblingsIntoGroup(assetId: string, batchId: string | undefined | null, basename: string) {
  if (!batchId) return;

  await db.transaction(async (tx) => {
    const siblings = await tx
      .select({ id: assets.id, groupId: assets.groupId })
      .from(assets)
      .where(and(eq(assets.batchId, batchId), eq(assets.basename, basename)))
      .for("update");

    if (siblings.length < 2) return;

    const existingGroupId = siblings.find((s) => s.groupId)?.groupId;
    const groupId = existingGroupId ?? (await tx.insert(assetGroups).values({}).returning({ id: assetGroups.id }))[0].id;

    for (const sibling of siblings) {
      if (sibling.groupId !== groupId) {
        await tx.update(assets).set({ groupId }).where(eq(assets.id, sibling.id));
      }
    }

    // Primary = the raw or jpeg member (not a sidecar), preferring whichever sorts
    // first by kind so the choice is at least deterministic; exactly one flag set.
    const groupMembers = await tx
      .select({ id: assets.id, kind: assets.kind })
      .from(assets)
      .where(eq(assets.groupId, groupId));
    const primary =
      groupMembers.find((m) => m.kind === "raw") ?? groupMembers.find((m) => m.kind !== "sidecar") ?? groupMembers[0];

    for (const member of groupMembers) {
      await tx
        .update(assets)
        .set({ isGroupPrimary: member.id === primary.id })
        .where(eq(assets.id, member.id));
    }
  });
}

export async function processIngestJob(job: Job<IngestJobData>) {
  const { assetId, storageKey, originalFilename, sha256, batchId } = job.data;

  const current = await db.query.assets.findFirst({ where: eq(assets.id, assetId) });
  if (!current) throw new Error(`asset ${assetId} not found`);
  // Idempotency guard: a duplicate job (e.g. a near-simultaneous upload race) for an
  // asset already processed is a no-op, not a re-process.
  if (current.status === "ready") return;

  await db.update(assets).set({ status: "processing", errorMessage: null }).where(eq(assets.id, assetId));

  const tempDir = await mkdtemp(path.join(tmpdir(), "mmp-ingest-"));
  const tempPath = path.join(tempDir, `original.${extOf(originalFilename) || "bin"}`);

  try {
    // 1. Verify object exists and its hash matches the claim (section 7 step 1).
    const buffer = await getObjectBuffer(storageKey);
    const actualHash = createHash("sha256").update(buffer).digest("hex");
    if (actualHash !== sha256) {
      throw new Error(`hash mismatch: expected ${sha256}, got ${actualHash}`);
    }
    await writeFile(tempPath, buffer);

    // 2. Metadata (section 7 step 2).
    const tags = await exiftool.read(tempPath);
    const capturedAt =
      typeof tags.DateTimeOriginal === "object" && tags.DateTimeOriginal
        ? tags.DateTimeOriginal.toDate()
        : null;
    const keywordList = normalizeKeywords(tags.Keywords ?? tags.Subject);

    // 3/4. Base raster + derivatives (section 7 steps 3-4). Sidecars carry no image.
    const rasterBuffer = await extractRasterBuffer(current.kind, tempPath, buffer);

    let width: number | null = null;
    let height: number | null = null;
    let lqip: string | null = null;

    if (rasterBuffer) {
      const generated = await generatePublicDerivatives(rasterBuffer);
      if (generated.length === 0) {
        throw new Error("no usable preview image (RAW had no embedded JpgFromRaw/PreviewImage)");
      }

      for (const d of generated) {
        const key = derivativeKey(sha256, d.variant, d.format);
        await putObject(key, d.buffer, `image/${d.format}`);
        await db
          .insert(derivatives)
          .values({
            assetId,
            variant: d.variant,
            format: d.format,
            width: d.width,
            height: d.height,
            storageKey: key,
            watermarked: false,
          })
          .onConflictDoNothing();
      }

      // The 2560 AVIF (largest generated) gives the truest dimensions of what we
      // actually derived from; fall back to whatever came back first.
      const dims = generated.find((d) => d.variant === "2560") ?? generated[0];
      width = dims.width;
      height = dims.height;
      lqip = await generateLqip(rasterBuffer);
    }

    // 5. LQIP already computed above (section 7 step 5).

    await db
      .update(assets)
      .set({ status: "ready", capturedAt, width, height, lqip, errorMessage: null })
      .where(eq(assets.id, assetId));

    await db
      .insert(assetMetadata)
      .values({
        assetId,
        camera: [tags.Make, tags.Model].filter(Boolean).join(" ") || null,
        lens: tags.LensModel ?? tags.Lens ?? null,
        iso: tags.ISO ?? null,
        shutter: tags.ShutterSpeed ?? null,
        aperture: tags.Aperture ? `f/${tags.Aperture}` : tags.FNumber ? `f/${tags.FNumber}` : null,
        focalLength: tags.FocalLength ?? null,
        gpsLat: typeof tags.GPSLatitude === "number" ? tags.GPSLatitude : null,
        gpsLon: typeof tags.GPSLongitude === "number" ? tags.GPSLongitude : null,
        rawExif: JSON.parse(JSON.stringify(tags)),
      })
      .onConflictDoUpdate({
        target: assetMetadata.assetId,
        set: {
          camera: [tags.Make, tags.Model].filter(Boolean).join(" ") || null,
          lens: tags.LensModel ?? tags.Lens ?? null,
          iso: tags.ISO ?? null,
          shutter: tags.ShutterSpeed ?? null,
          aperture: tags.Aperture ? `f/${tags.Aperture}` : tags.FNumber ? `f/${tags.FNumber}` : null,
          focalLength: tags.FocalLength ?? null,
          gpsLat: typeof tags.GPSLatitude === "number" ? tags.GPSLatitude : null,
          gpsLon: typeof tags.GPSLongitude === "number" ? tags.GPSLongitude : null,
          rawExif: JSON.parse(JSON.stringify(tags)),
        },
      });

    // 6. Import IPTC/XMP keywords (section 7 step 2 / section 4 keywords).
    for (const value of keywordList) {
      const [kw] = await db
        .insert(keywords)
        .values({ value })
        .onConflictDoUpdate({ target: keywords.value, set: { value } })
        .returning({ id: keywords.id });
      await db.insert(assetKeywords).values({ assetId, keywordId: kw.id }).onConflictDoNothing();
    }

    // 7. Link RAW+JPEG pairs and .xmp sidecars by basename (section 7 step 6).
    await linkSiblingsIntoGroup(assetId, batchId, current.basename);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(assets).set({ status: "failed", errorMessage: message }).where(eq(assets.id, assetId));
    throw err;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
