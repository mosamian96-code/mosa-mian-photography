import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets, galleries, galleryItems } from "@/lib/db/schema";
import { resolveLiveClientAccess } from "@/lib/public-site/client-access-auth";
import { resolveDownloadTarget } from "@/lib/public-site/download";
import { presignDownloadUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Client-proofing links only -- a private, per-recipient token someone was
// deliberately sent, not something reachable from a regular public gallery page.
// General site visitors get no download path at all, by design.
export async function GET(req: NextRequest) {
  const clientAccessId = req.nextUrl.searchParams.get("clientAccessId");
  const assetId = req.nextUrl.searchParams.get("assetId");
  if (!clientAccessId || !assetId) {
    return NextResponse.json({ error: "clientAccessId and assetId required" }, { status: 400 });
  }

  const resolved = await resolveLiveClientAccess(clientAccessId);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (!resolved.link.downloadsEnabled) return NextResponse.json({ error: "downloads disabled" }, { status: 403 });
  const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, resolved.link.galleryId) });
  if (!gallery || gallery.downloadsPolicy === "off") {
    return NextResponse.json({ error: "downloads disabled" }, { status: 403 });
  }

  const inGallery = await db.query.galleryItems.findFirst({
    where: and(eq(galleryItems.galleryId, gallery.id), eq(galleryItems.assetId, assetId)),
  });
  if (!inGallery) return NextResponse.json({ error: "not in this gallery" }, { status: 400 });

  const asset = await db.query.assets.findFirst({ where: and(eq(assets.id, assetId), isNull(assets.deletedAt)) });
  if (!asset) return NextResponse.json({ error: "not found" }, { status: 404 });

  const target = await resolveDownloadTarget(gallery.downloadsPolicy, gallery, asset);
  if (!target) return NextResponse.json({ error: "not ready" }, { status: 404 });

  const url = await presignDownloadUrl(target.storageKey, target.filename);
  return NextResponse.redirect(url);
}
