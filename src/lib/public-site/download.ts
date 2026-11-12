import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { derivatives } from "@/lib/db/schema";

type DownloadableAsset = { id: string; storageKey: string; originalFilename: string };
type DownloadableGallery = { watermarkId: string | null };

/** Resolves which file a download request should actually receive, for a policy
 * that isn't "off" -- "original" is the source file as uploaded; "web" is the
 * largest on-screen derivative, watermarked if the gallery has a watermark. A
 * watermarked gallery never hands out the clean version, not even while its
 * watermarked one is still being generated: that download reports "not ready"
 * (null) instead. Shared by the client-proofing download route, the public
 * gallery-download route, and both zip routes, which differ only in how they
 * authorize the request. */
export async function resolveDownloadTarget(
  policy: "web" | "original",
  gallery: DownloadableGallery,
  asset: DownloadableAsset,
): Promise<{ storageKey: string; filename: string } | null> {
  if (policy === "original") {
    return { storageKey: asset.storageKey, filename: asset.originalFilename };
  }

  const derivative = await db.query.derivatives.findFirst({
    where: and(
      eq(derivatives.assetId, asset.id),
      eq(derivatives.variant, "2560"),
      eq(derivatives.format, "jpeg"),
      eq(derivatives.watermarked, Boolean(gallery.watermarkId)),
    ),
  });
  if (!derivative) return null;

  return { storageKey: derivative.storageKey, filename: `${asset.originalFilename.replace(/\.[^.]+$/, "")}.jpg` };
}
