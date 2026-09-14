import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { derivatives } from "@/lib/db/schema";

type DownloadableAsset = { id: string; storageKey: string; originalFilename: string };
type DownloadableGallery = { watermarkId: string | null };

/** Resolves which file a download request should actually receive, for a policy
 * that isn't "off" -- "original" is the source file as uploaded; "web" is the
 * largest on-screen derivative (watermarked if the gallery has one assigned, falling
 * back to clean if that job hasn't finished yet). Shared by the client-proofing
 * download route, the public gallery-download route, and the public gallery zip
 * route, which differ only in how they authorize the request. */
export async function resolveDownloadTarget(
  policy: "web" | "original",
  gallery: DownloadableGallery,
  asset: DownloadableAsset,
): Promise<{ storageKey: string; filename: string } | null> {
  if (policy === "original") {
    return { storageKey: asset.storageKey, filename: asset.originalFilename };
  }

  const wantWatermarked = Boolean(gallery.watermarkId);
  const derivative =
    (wantWatermarked &&
      (await db.query.derivatives.findFirst({
        where: and(
          eq(derivatives.assetId, asset.id),
          eq(derivatives.variant, "2560"),
          eq(derivatives.format, "jpeg"),
          eq(derivatives.watermarked, true),
        ),
      }))) ||
    (await db.query.derivatives.findFirst({
      where: and(
        eq(derivatives.assetId, asset.id),
        eq(derivatives.variant, "2560"),
        eq(derivatives.format, "jpeg"),
        eq(derivatives.watermarked, false),
      ),
    }));
  if (!derivative) return null;

  return { storageKey: derivative.storageKey, filename: `${asset.originalFilename.replace(/\.[^.]+$/, "")}.jpg` };
}
