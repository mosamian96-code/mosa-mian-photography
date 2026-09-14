import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets, folders, galleries, galleryItems } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";
import { getObjectStream } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only zip of every photo in a folder and everything nested inside it. Ids are
 * resolved server-side via a recursive query rather than passed in the URL (as the
 * gallery/library zip routes do) -- a folder can hold thousands of photos across many
 * nested galleries, easily blowing past a URL length limit if listed there instead. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { id } = await params;
  const folder = await db.query.folders.findFirst({ where: eq(folders.id, id) });
  if (!folder) return NextResponse.json({ error: "not found" }, { status: 404 });

  const descendantFolderIds = await db.execute<{ id: string }>(sql`
    with recursive descendants as (
      select id from ${folders} where id = ${id}
      union all
      select f.id from ${folders} f join descendants d on f.parent_id = d.id
    )
    select id from descendants
  `);
  const folderIds = descendantFolderIds.map((r) => r.id);

  const items = await db
    .select({ filename: assets.originalFilename, storageKey: assets.storageKey })
    .from(galleryItems)
    .innerJoin(assets, eq(assets.id, galleryItems.assetId))
    .innerJoin(galleries, eq(galleries.id, galleryItems.galleryId))
    .where(and(inArray(galleries.folderId, folderIds), isNull(assets.deletedAt)));

  if (items.length === 0) return NextResponse.json({ error: "folder has no photos" }, { status: 400 });

  const archive = new ZipArchive({ zlib: { level: 6 } });

  (async () => {
    try {
      const seenNames = new Map<string, number>();
      for (const item of items) {
        let name = item.filename;
        const count = seenNames.get(name) ?? 0;
        seenNames.set(name, count + 1);
        if (count > 0) {
          const dot = name.lastIndexOf(".");
          name = dot > 0 ? `${name.slice(0, dot)} (${count})${name.slice(dot)}` : `${name} (${count})`;
        }
        const stream = await getObjectStream(item.storageKey);
        archive.append(stream, { name });
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
      "Content-Disposition": `attachment; filename="${folder.slug}.zip"`,
    },
  });
}
