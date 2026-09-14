import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { inArray, isNull, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";
import { getObjectStream } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only zip of an arbitrary set of originals -- shared by "download whole
 * gallery" (pass every item's assetId) and "download selected" in the library/gallery
 * editor's bulk-select mode. Streams each file into the archive as it's fetched from
 * B2 rather than buffering, same reasoning as the per-gallery route this replaced. */
export async function GET(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const idsParam = req.nextUrl.searchParams.get("ids");
  const name = req.nextUrl.searchParams.get("name") || "photos";
  const ids = idsParam?.split(",").filter(Boolean) ?? [];
  if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });

  const items = await db
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
      archive.destroy(err instanceof Error ? err : new Error(String(err)));
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
