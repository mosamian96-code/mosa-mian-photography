import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets, galleries, galleryItems } from "@/lib/db/schema";
import { resolveLiveClientAccess } from "@/lib/public-site/client-access-auth";
import { resolveDownloadSize, resolveDownloadTarget, zipNameFor } from "@/lib/public-site/download";
import { withErrorLogging } from "@/lib/with-error-logging";
import { type ZipEntry, zipResponse } from "@/lib/zip-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whole-album zip for a client-proofing link, gated by the link itself
 * (clientAccessId + its own downloadsEnabled flag) -- the same authorization the
 * link's single-photo download route uses. `size` is "web" or "original" (see
 * resolveDownloadSize). */
export const GET = withErrorLogging("client-access-download-zip", async (req: NextRequest) => {
  const clientAccessId = req.nextUrl.searchParams.get("clientAccessId");
  if (!clientAccessId) return NextResponse.json({ error: "clientAccessId required" }, { status: 400 });

  const resolved = await resolveLiveClientAccess(clientAccessId);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (!resolved.link.downloadsEnabled) return NextResponse.json({ error: "downloads disabled" }, { status: 403 });

  const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, resolved.link.galleryId) });
  if (!gallery || gallery.downloadsPolicy === "off") {
    return NextResponse.json({ error: "downloads disabled" }, { status: 403 });
  }
  const size = resolveDownloadSize(gallery.downloadsPolicy, req.nextUrl.searchParams.get("size"));
  if (!size.ok) return NextResponse.json({ error: size.error }, { status: size.status });
  const chosenSize = size.size;

  const items = await db
    .select({ asset: assets })
    .from(galleryItems)
    .innerJoin(assets, eq(assets.id, galleryItems.assetId))
    .where(and(eq(galleryItems.galleryId, gallery.id), isNull(assets.deletedAt)));
  if (items.length === 0) return NextResponse.json({ error: "gallery is empty" }, { status: 404 });

  const watermark = { watermarkId: gallery.watermarkId };
  async function* targets(): AsyncIterable<ZipEntry> {
    for (const { asset } of items) {
      const target = await resolveDownloadTarget(chosenSize, watermark, asset);
      if (target) yield target;
    }
  }

  return zipResponse("client-access-download-zip", zipNameFor(gallery.slug, chosenSize), targets(), req.signal);
});
