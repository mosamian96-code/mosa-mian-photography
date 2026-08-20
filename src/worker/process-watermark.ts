import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { assets, derivatives, watermarks } from "@/lib/db/schema";
import { generateWatermarkedDerivatives } from "@/lib/ingest/derivative";
import { derivativeKey, getObjectBuffer, putObject, watermarkedKey } from "@/lib/storage";
import type { WatermarkJobData } from "@/lib/queue";

/**
 * Source raster for watermarking is the already-generated clean 2560 JPEG derivative,
 * not the original file. It's already oriented and EXIF-stripped, and 2560 is the
 * largest size any derivative set needs, so re-touching the original (including a
 * second RAW preview extraction) would cost real CPU on the VPS for no visible gain.
 */
export async function processWatermarkJob(job: Job<WatermarkJobData>) {
  const { assetId, watermarkId } = job.data;

  const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId) });
  if (!asset) throw new Error(`asset ${assetId} not found`);
  if (asset.status !== "ready") return; // not processed yet; nothing to watermark

  const watermark = await db.query.watermarks.findFirst({ where: eq(watermarks.id, watermarkId) });
  if (!watermark) throw new Error(`watermark ${watermarkId} not found`);

  const [sourceBuffer, markBuffer] = await Promise.all([
    getObjectBuffer(derivativeKey(asset.sha256, "2560", "jpeg")),
    getObjectBuffer(watermark.storageKey),
  ]);

  const generated = await generateWatermarkedDerivatives(
    sourceBuffer,
    markBuffer,
    watermark.position,
    watermark.opacity,
  );

  for (const d of generated) {
    const key = watermarkedKey(asset.sha256, d.variant, d.format);
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
        watermarked: true,
      })
      .onConflictDoUpdate({
        target: [derivatives.assetId, derivatives.variant, derivatives.format, derivatives.watermarked],
        set: { storageKey: key, width: d.width, height: d.height },
      });
  }
}
