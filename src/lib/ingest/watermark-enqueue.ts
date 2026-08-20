import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { galleryItems } from "@/lib/db/schema";
import { watermarkQueue } from "@/lib/queue";

export async function enqueueWatermarkForAssets(assetIds: string[], watermarkId: string) {
  if (assetIds.length === 0) return;
  await watermarkQueue.addBulk(
    assetIds.map((assetId) => ({ name: "watermark", data: { assetId, watermarkId } })),
  );
}

export async function enqueueWatermarkForGallery(galleryId: string, watermarkId: string) {
  const items = await db.query.galleryItems.findMany({
    where: eq(galleryItems.galleryId, galleryId),
    columns: { assetId: true },
  });
  await enqueueWatermarkForAssets(
    items.map((i) => i.assetId),
    watermarkId,
  );
}
