import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets, galleries, galleryItems } from "@/lib/db/schema";
import { resolveDownloadSize, resolveDownloadTarget, zipNameFor } from "@/lib/public-site/download";
import { gallerySessionCookieName, publicVisitorCanViewGallery } from "@/lib/public-site/gallery-auth";
import { withErrorLogging } from "@/lib/with-error-logging";
import { type ZipEntry, zipResponse } from "@/lib/zip-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whole-gallery download for ordinary visitors, gated the same way the single-photo
 * public-download route is. `size` is "web" or "original" (see resolveDownloadSize). */
export const GET = withErrorLogging("public-gallery-download-zip", async (req: NextRequest) => {
  const galleryId = req.nextUrl.searchParams.get("galleryId");
  if (!galleryId) return NextResponse.json({ error: "galleryId required" }, { status: 400 });

  const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, galleryId) });
  if (!gallery || gallery.publicDownloadsPolicy === "off") {
    return NextResponse.json({ error: "downloads disabled" }, { status: 403 });
  }
  const token = req.cookies.get(gallerySessionCookieName(galleryId))?.value;
  if (!publicVisitorCanViewGallery(gallery, token)) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }
  const size = resolveDownloadSize(gallery.publicDownloadsPolicy, req.nextUrl.searchParams.get("size"));
  if (!size.ok) return NextResponse.json({ error: size.error }, { status: size.status });
  const chosenSize = size.size;

  const items = await db
    .select({ asset: assets })
    .from(galleryItems)
    .innerJoin(assets, eq(assets.id, galleryItems.assetId))
    .where(and(eq(galleryItems.galleryId, galleryId), isNull(assets.deletedAt)));
  if (items.length === 0) return NextResponse.json({ error: "gallery is empty" }, { status: 404 });

  const watermark = { watermarkId: gallery.watermarkId };
  async function* targets(): AsyncIterable<ZipEntry> {
    for (const { asset } of items) {
      const target = await resolveDownloadTarget(chosenSize, watermark, asset);
      if (target) yield target;
    }
  }

  return zipResponse("public-gallery-download-zip", zipNameFor(gallery.slug, chosenSize), targets(), req.signal);
});
