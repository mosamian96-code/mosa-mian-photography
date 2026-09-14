import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets, galleries, galleryItems } from "@/lib/db/schema";
import { resolveDownloadTarget } from "@/lib/public-site/download";
import { gallerySessionCookieName, publicVisitorCanViewGallery } from "@/lib/public-site/gallery-auth";
import { presignDownloadUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The public counterpart to /api/public/download (which is client-proofing-link
// only): gated by gallery.publicDownloadsPolicy plus the same view-authorization a
// visitor needs to see the gallery page at all, rather than a client link.
export async function GET(req: NextRequest) {
  const galleryId = req.nextUrl.searchParams.get("galleryId");
  const assetId = req.nextUrl.searchParams.get("assetId");
  if (!galleryId || !assetId) {
    return NextResponse.json({ error: "galleryId and assetId required" }, { status: 400 });
  }

  const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, galleryId) });
  if (!gallery || gallery.publicDownloadsPolicy === "off") {
    return NextResponse.json({ error: "downloads disabled" }, { status: 403 });
  }
  const token = req.cookies.get(gallerySessionCookieName(galleryId))?.value;
  if (!publicVisitorCanViewGallery(gallery.visibility, galleryId, token)) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const inGallery = await db.query.galleryItems.findFirst({
    where: and(eq(galleryItems.galleryId, galleryId), eq(galleryItems.assetId, assetId)),
  });
  if (!inGallery) return NextResponse.json({ error: "not in this gallery" }, { status: 400 });

  const asset = await db.query.assets.findFirst({ where: and(eq(assets.id, assetId), isNull(assets.deletedAt)) });
  if (!asset) return NextResponse.json({ error: "not found" }, { status: 404 });

  const target = await resolveDownloadTarget(gallery.publicDownloadsPolicy, gallery, asset);
  if (!target) return NextResponse.json({ error: "not ready" }, { status: 404 });

  const url = await presignDownloadUrl(target.storageKey, target.filename);
  return NextResponse.redirect(url);
}
