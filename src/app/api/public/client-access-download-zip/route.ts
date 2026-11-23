import { and, eq, exists, isNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { recordClientActivity } from "@/lib/client-activity";
import { db } from "@/lib/db";
import { assets, favorites, galleries, galleryItems } from "@/lib/db/schema";
import { resolveLiveClientAccess } from "@/lib/public-site/client-access-auth";
import { resolveDownloadSize, resolveDownloadTarget, zipNameFor } from "@/lib/public-site/download";
import { withErrorLogging } from "@/lib/with-error-logging";
import { type ZipEntry, zipResponse } from "@/lib/zip-download";
import { countGalleryStat } from "@/lib/gallery-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whole-album zip for a client-proofing link, gated by the link itself
 * (clientAccessId + its own downloadsEnabled flag) -- the same authorization the
 * link's single-photo download route uses. `size` is "web" or "original" (see
 * resolveDownloadSize). `favorites=1` zips only the photos this link has favorited. */
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
  const favoritesParam = req.nextUrl.searchParams.get("favorites");
  if (favoritesParam !== null && favoritesParam !== "1") return NextResponse.json({ error: "favorites must be 1" }, { status: 400 });
  const onlyFavorites = favoritesParam === "1";

  const items = await db
    .select({ asset: assets })
    .from(galleryItems)
    .innerJoin(assets, eq(assets.id, galleryItems.assetId))
    .where(
      and(
        eq(galleryItems.galleryId, gallery.id),
        isNull(assets.deletedAt),
        // Favorites are per link, so another client's picks never end up in this zip.
        onlyFavorites
          ? exists(
              db
                .select({ one: sql`1` })
                .from(favorites)
                .where(and(eq(favorites.clientAccessId, resolved.link.id), eq(favorites.assetId, assets.id))),
            )
          : undefined,
      ),
    );
  if (items.length === 0) {
    return NextResponse.json({ error: onlyFavorites ? "no favorites yet" : "gallery is empty" }, { status: 404 });
  }

  const watermark = { watermarkId: gallery.watermarkId };
  async function* targets(): AsyncIterable<ZipEntry> {
    for (const { asset } of items) {
      const target = await resolveDownloadTarget(chosenSize, watermark, asset);
      if (target) yield target;
    }
  }

  const zipName = zipNameFor(onlyFavorites ? `${gallery.slug}-favorites` : gallery.slug, chosenSize);
  const res = zipResponse("client-access-download-zip", zipName, targets(), req.signal);
  // Recorded only once the zip is actually starting (not when it's refused with 503).
  if (res.ok) {
    await recordClientActivity(resolved.link, { kind: onlyFavorites ? "download_favorites" : "download_all", size: chosenSize });
    countGalleryStat(gallery.id, "downloads");
  }
  return res;
});
