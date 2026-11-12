import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets, galleryItems } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";
import { withErrorLogging } from "@/lib/with-error-logging";
import { zipResponse } from "@/lib/zip-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only zip of a set of originals -- shared by "download whole gallery" and
 * "download selected" in the library/gallery editor's bulk-select mode.
 *
 * galleryId (whole gallery) and ids (an explicit subset) are alternatives. Passing
 * every item's id for a ~215-item gallery built an ~8KB URL whose connection was
 * refused outright, so galleryId resolves items server-side instead; "download
 * selected" still needs an explicit id list, since it's an arbitrary user-picked
 * subset. */
export const GET = withErrorLogging("library-download-zip", async (req: NextRequest) => {
  const { response } = await requireAdminSession();
  if (response) return response;

  const idsParam = req.nextUrl.searchParams.get("ids");
  const galleryId = req.nextUrl.searchParams.get("galleryId");
  const name = req.nextUrl.searchParams.get("name") || "photos";
  const ids = idsParam?.split(",").filter(Boolean) ?? [];
  if (ids.length === 0 && !galleryId) {
    return NextResponse.json({ error: "ids or galleryId required" }, { status: 400 });
  }

  const items = galleryId
    ? await db
        .select({ filename: assets.originalFilename, storageKey: assets.storageKey })
        .from(galleryItems)
        .innerJoin(assets, eq(assets.id, galleryItems.assetId))
        .where(and(eq(galleryItems.galleryId, galleryId), isNull(assets.deletedAt)))
    : await db
        .select({ filename: assets.originalFilename, storageKey: assets.storageKey })
        .from(assets)
        .where(and(inArray(assets.id, ids), isNull(assets.deletedAt)));
  if (items.length === 0) return NextResponse.json({ error: "no matching photos" }, { status: 404 });

  return zipResponse("library-download-zip", name, items, req.signal);
});
