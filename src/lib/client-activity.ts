import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientActivity } from "@/lib/db/schema";
import { logError } from "@/lib/error-log";

type Activity = typeof clientActivity.$inferInsert;
type Link = { id: string; galleryId: string };

/** A visit, not a page load: reloading or coming back within this long after the last
 * recorded view doesn't count as another. */
export const VIEW_SESSION_MS = 30 * 60 * 1000;

/**
 * Records one thing a client did. The log is a record for the photographer, never a
 * reason to fail what the client was doing, so a failed write is logged to the error
 * log and swallowed -- the download, favorite or comment still goes through.
 */
export async function recordClientActivity(link: Link, entry: Pick<Activity, "kind" | "assetId" | "size">) {
  try {
    await db.insert(clientActivity).values({ clientAccessId: link.id, galleryId: link.galleryId, ...entry });
  } catch (err) {
    await logError("client-activity", err);
  }
}

/** Records that the client opened the gallery, unless they already did within
 * VIEW_SESSION_MS. One statement, so the check and the insert see the same state. */
export async function recordClientView(link: Link) {
  try {
    const since = new Date(Date.now() - VIEW_SESSION_MS);
    await db.execute(sql`
      insert into ${clientActivity} (id, client_access_id, gallery_id, kind)
      select ${crypto.randomUUID()}, ${link.id}, ${link.galleryId}, 'view'
      where not exists (
        select 1 from ${clientActivity}
        where ${and(eq(clientActivity.clientAccessId, link.id), eq(clientActivity.kind, "view"), gt(clientActivity.createdAt, since))}
      )
    `);
  } catch (err) {
    await logError("client-activity", err);
  }
}
