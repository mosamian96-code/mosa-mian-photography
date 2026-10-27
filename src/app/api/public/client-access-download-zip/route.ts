import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets, galleries, galleryItems } from "@/lib/db/schema";
import { logError } from "@/lib/error-log";
import { resolveLiveClientAccess } from "@/lib/public-site/client-access-auth";
import { resolveDownloadTarget } from "@/lib/public-site/download";
import { getObjectStream } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whole-album "one button" zip for a client-proofing link -- mirrors
 * /api/public/gallery-download-zip (the ordinary-visitor version), but gated by
 * the client link itself (clientAccessId + its own downloadsEnabled flag) rather
 * than the public gallery-visibility cookie flow, same auth this link's existing
 * single-photo download route (/api/public/download) already uses. Didn't exist
 * before -- a client link only had per-photo downloads, no "download everything"
 * option. */
export async function GET(req: NextRequest) {
  const clientAccessId = req.nextUrl.searchParams.get("clientAccessId");
  if (!clientAccessId) return NextResponse.json({ error: "clientAccessId required" }, { status: 400 });

  const resolved = await resolveLiveClientAccess(clientAccessId);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (!resolved.link.downloadsEnabled) return NextResponse.json({ error: "downloads disabled" }, { status: 403 });

  const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, resolved.link.galleryId) });
  if (!gallery || gallery.downloadsPolicy === "off") {
    return NextResponse.json({ error: "downloads disabled" }, { status: 403 });
  }
  const policy = gallery.downloadsPolicy;

  const items = await db
    .select({ asset: assets })
    .from(galleryItems)
    .innerJoin(assets, eq(assets.id, galleryItems.assetId))
    .where(and(eq(galleryItems.galleryId, gallery.id), isNull(assets.deletedAt)));
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
      const error = err instanceof Error ? err : new Error(String(err));
      await logError("client-access-download-zip", error);
      archive.destroy(error);
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
