import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { inArray, isNull, and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets, galleryItems } from "@/lib/db/schema";
import { logError } from "@/lib/error-log";
import { requireAdminSession } from "@/lib/require-admin";
import { getObjectStream } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only zip of a set of originals -- shared by "download whole gallery" and
 * "download selected" in the library/gallery editor's bulk-select mode. Streams each
 * file into the archive as it's fetched from B2 rather than buffering, same
 * reasoning as the per-gallery route this replaced.
 *
 * galleryId (whole gallery) and ids (an explicit subset) are alternatives, not both
 * required -- confirmed live: passing every item's id as a comma-joined query param
 * for a ~215-item gallery built an ~8KB URL that the raw connection was refused for
 * outright (curl got a bare connection reset, no HTTP response at all) before the
 * request even reached the app. galleryId sidesteps that entirely by resolving items
 * server-side, the same way the public gallery-download-zip route already does;
 * "download selected" still needs an explicit id list (it's an arbitrary
 * user-picked subset), so that path is unchanged and carries the same latent risk
 * if someone selects an extreme number of items in one go. */
export async function GET(req: NextRequest) {
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

  const archive = new ZipArchive({ zlib: { level: 6 } });

  (async () => {
    try {
      const seenNames = new Map<string, number>();
      for (const item of items) {
        let entryName = item.filename;
        const count = seenNames.get(entryName) ?? 0;
        seenNames.set(entryName, count + 1);
        if (count > 0) {
          const dot = entryName.lastIndexOf(".");
          entryName = dot > 0 ? `${entryName.slice(0, dot)} (${count})${entryName.slice(dot)}` : `${entryName} (${count})`;
        }
        const stream = await getObjectStream(item.storageKey);
        archive.append(stream, { name: entryName });
      }
      await archive.finalize();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await logError("library-download-zip", error);
      archive.destroy(error);
    }
  })();

  const webStream = Readable.toWeb(archive) as ReadableStream;
  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}.zip"`,
    },
  });
}
