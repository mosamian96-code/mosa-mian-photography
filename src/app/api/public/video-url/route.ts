import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, galleryItems, galleries } from "@/lib/db/schema";
import { resolveLiveClientAccess } from "@/lib/public-site/client-access-auth";
import { gallerySessionCookieName, publicVisitorCanViewGallery } from "@/lib/public-site/gallery-auth";
import { isPubliclyVisibleAsset } from "@/lib/public-site/resolve";
import { presignGetUrl } from "@/lib/storage";
import { withErrorLogging } from "@/lib/with-error-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A short-lived URL the lightbox's player streams a video from. Authorized exactly
 * the way the page showing it was: a client link (clientAccessId, re-validated live),
 * a gallery page (galleryId, with the same password cookie the page needs), or a
 * cross-gallery page such as a keyword page (neither: the video must appear in some
 * public gallery). */
export const GET = withErrorLogging("public-video-url", async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const assetId = params.get("assetId");
  const clientAccessId = params.get("clientAccessId");
  const galleryId = params.get("galleryId");
  if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });

  let authorizedGalleryId: string | null = null;
  if (clientAccessId) {
    const resolved = await resolveLiveClientAccess(clientAccessId);
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    authorizedGalleryId = resolved.link.galleryId;
  } else if (galleryId) {
    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, galleryId) });
    const token = req.cookies.get(gallerySessionCookieName(galleryId))?.value;
    if (!gallery || !publicVisitorCanViewGallery(gallery, token)) {
      return NextResponse.json({ error: "gallery not accessible" }, { status: 403 });
    }
    authorizedGalleryId = gallery.id;
  } else if (!(await isPubliclyVisibleAsset(assetId))) {
    return NextResponse.json({ error: "video not accessible" }, { status: 403 });
  }

  if (authorizedGalleryId) {
    const inGallery = await db.query.galleryItems.findFirst({
      where: and(eq(galleryItems.galleryId, authorizedGalleryId), eq(galleryItems.assetId, assetId)),
    });
    if (!inGallery) return NextResponse.json({ error: "video not in gallery" }, { status: 400 });
  }

  const asset = await db.query.assets.findFirst({ where: and(eq(assets.id, assetId), isNull(assets.deletedAt)) });
  if (!asset || asset.kind !== "video") {
    return NextResponse.json({ error: "video not found" }, { status: 404 });
  }

  const url = await presignGetUrl(asset.storageKey, 3600);
  return NextResponse.json({ url });
});
