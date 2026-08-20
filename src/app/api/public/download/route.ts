import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets, derivatives, galleries, galleryItems } from "@/lib/db/schema";
import { resolveLiveClientAccess } from "@/lib/public-site/client-access-auth";
import { presignDownloadUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId) });
  if (!asset) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (gallery.downloadsPolicy === "original") {
    const url = await presignDownloadUrl(asset.storageKey, asset.originalFilename);
    return NextResponse.redirect(url);
  }

  // "web": whatever's shown on screen — watermarked if the gallery has a watermark
  // assigned, falling back to the clean derivative if that job hasn't finished yet.
  const wantWatermarked = Boolean(gallery.watermarkId);
  const derivative =
    (wantWatermarked &&
      (await db.query.derivatives.findFirst({
        where: and(
          eq(derivatives.assetId, assetId),
          eq(derivatives.variant, "2560"),
          eq(derivatives.format, "jpeg"),
          eq(derivatives.watermarked, true),
        ),
      }))) ||
    (await db.query.derivatives.findFirst({
      where: and(
        eq(derivatives.assetId, assetId),
        eq(derivatives.variant, "2560"),
        eq(derivatives.format, "jpeg"),
        eq(derivatives.watermarked, false),
      ),
    }));
  if (!derivative) return NextResponse.json({ error: "not ready" }, { status: 404 });

  const filename = `${asset.originalFilename.replace(/\.[^.]+$/, "")}.jpg`;
  const url = await presignDownloadUrl(derivative.storageKey, filename);
  return NextResponse.redirect(url);
}
