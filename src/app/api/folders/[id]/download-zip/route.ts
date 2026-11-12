import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets, folders, galleries, galleryItems } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/require-admin";
import { withErrorLogging } from "@/lib/with-error-logging";
import { zipResponse } from "@/lib/zip-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only zip of every photo in a folder and everything nested inside it. Ids are
 * resolved server-side via a recursive query rather than passed in the URL -- a folder
 * can hold thousands of photos across many nested galleries, easily blowing past a URL
 * length limit if listed there instead. */
export const GET = withErrorLogging(
  "folder-download-zip",
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
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

    return zipResponse("folder-download-zip", folder.slug, items, req.signal);
  },
);
