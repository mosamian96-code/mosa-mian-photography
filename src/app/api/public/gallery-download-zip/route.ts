import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets, galleries, galleryItems } from "@/lib/db/schema";
import { resolveDownloadTarget } from "@/lib/public-site/download";
import { gallerySessionCookieName, publicVisitorCanViewGallery } from "@/lib/public-site/gallery-auth";
import { getObjectStream } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whole-gallery download for ordinary visitors, gated the same way the single-photo
 * public-download route is. Streams straight from storage rather than through a
 * presigned URL per file, same reasoning as the admin download-zip route this
 * mirrors. */
export async function GET(req: NextRequest) {
  const galleryId = req.nextUrl.searchParams.get("galleryId");
  if (!galleryId) return NextResponse.json({ error: "galleryId required" }, { status: 400 });

  const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, galleryId) });
  if (!gallery || gallery.publicDownloadsPolicy === "off") {
    return NextResponse.json({ error: "downloads disabled" }, { status: 403 });
  }
  const policy = gallery.publicDownloadsPolicy;
  const token = req.cookies.get(gallerySessionCookieName(galleryId))?.value;
  if (!publicVisitorCanViewGallery(gallery.visibility, galleryId, token)) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const items = await db
    .select({ asset: assets })
    .from(galleryItems)
    .innerJoin(assets, eq(assets.id, galleryItems.assetId))
    .where(and(eq(galleryItems.galleryId, galleryId), isNull(assets.deletedAt)));
  if (items.length === 0) return NextResponse.json({ error: "gallery is empty" }, { status: 404 });

  const archive = new ZipArchive({ zlib: { level: 6 } });

  (async () => {
    try {
      const seenNames = new Map<string, number>();
      for (const { asset } of items) {
        const target = await resolveDownloadTarget(policy, gallery, asset);
        if (!target) continue;
        let entryName = target.filename;
        const count = seenNames.get(entryName) ?? 0;
        seenNames.set(entryName, count + 1);
        if (count > 0) {
          const dot = entryName.lastIndexOf(".");
          entryName = dot > 0 ? `${entryName.slice(0, dot)} (${count})${entryName.slice(dot)}` : `${entryName} (${count})`;
        }
        const stream = await getObjectStream(target.storageKey);
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
      "Content-Disposition": `attachment; filename="${gallery.slug}.zip"`,
    },
  });
}
