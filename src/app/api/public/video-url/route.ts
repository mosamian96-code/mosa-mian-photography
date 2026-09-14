import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, galleryItems, galleries } from "@/lib/db/schema";
import { presignGetUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const galleryId = req.nextUrl.searchParams.get("galleryId");
  const assetId = req.nextUrl.searchParams.get("assetId");

  if (!galleryId || !assetId) {
    return NextResponse.json({ error: "galleryId and assetId required" }, { status: 400 });
  }

  const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, galleryId) });
  if (!gallery || gallery.visibility === "private") {
    return NextResponse.json({ error: "gallery not accessible" }, { status: 403 });
  }

  const inGallery = await db.query.galleryItems.findFirst({
    where: and(eq(galleryItems.galleryId, galleryId), eq(galleryItems.assetId, assetId)),
  });
  if (!inGallery) {
    return NextResponse.json({ error: "video not in gallery" }, { status: 400 });
  }

  const asset = await db.query.assets.findFirst({
    where: and(eq(assets.id, assetId), isNull(assets.deletedAt)),
  });
  if (!asset || asset.kind !== "video") {
    return NextResponse.json({ error: "video not found" }, { status: 404 });
  }

  const url = await presignGetUrl(asset.storageKey, 3600);
  return NextResponse.json({ url });
}
