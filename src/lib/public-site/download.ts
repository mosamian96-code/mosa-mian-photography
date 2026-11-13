import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { derivatives } from "@/lib/db/schema";

/** "original" is the source file as uploaded (full resolution, for printing); "web" is
 * the 2560px on-screen JPEG, watermarked if the gallery has a watermark. */
export type DownloadSize = "web" | "original";

type DownloadableAsset = { id: string; kind: string; storageKey: string; originalFilename: string };
type DownloadableGallery = { watermarkId: string | null };

/**
 * Which size a download request gets, given the gallery's policy (anything but "off").
 * Web size is always allowed while downloads are on; full resolution only when the
 * gallery offers originals. A request that names no size gets the largest the gallery
 * allows, which is what every download link did before visitors could choose.
 */
export function resolveDownloadSize(
  policy: DownloadSize,
  requested: string | null,
): { ok: true; size: DownloadSize } | { ok: false; status: 400 | 403; error: string } {
  if (requested === null || requested === "") return { ok: true, size: policy };
  if (requested !== "web" && requested !== "original") {
    return { ok: false, status: 400, error: "size must be web or original" };
  }
  if (requested === "original" && policy !== "original") {
    return { ok: false, status: 403, error: "full-resolution downloads are not offered for this gallery" };
  }
  return { ok: true, size: requested };
}

/** A zip's download name: the gallery slug, marked when it holds web-size copies so a
 * client who downloads both can tell them apart. */
export function zipNameFor(slug: string, size: DownloadSize) {
  return size === "web" ? `${slug}-web-size` : slug;
}

/** Resolves which file a download request should actually receive. A watermarked
 * gallery never hands out a clean web-size photo, not even while its watermarked one
 * is still being generated: that download reports "not ready" (null) instead. A video
 * has no web-size version (its derivatives are stills of the poster frame), so it is
 * always the original file -- the same file the gallery's player already streams to
 * anyone who can view it. Shared by the client-proofing download route, the public
 * gallery-download route, and both zip routes, which differ only in how they
 * authorize the request. */
export async function resolveDownloadTarget(
  size: DownloadSize,
  gallery: DownloadableGallery,
  asset: DownloadableAsset,
): Promise<{ storageKey: string; filename: string } | null> {
  if (size === "original" || asset.kind === "video") {
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
