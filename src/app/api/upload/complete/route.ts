import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets, importBatches } from "@/lib/db/schema";
import { maybeFinalizeBatch } from "@/lib/ingest/batch";
import { basenameOf, classifyKind } from "@/lib/ingest/classify";
import { ingestQueue } from "@/lib/queue";
import { completeMultipartUpload, headObject } from "@/lib/storage";
import { requireAdminSession } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const body = (await req.json()) as {
    storageKey?: string;
    uploadId?: string;
    parts?: { partNumber: number; etag: string }[];
    sha256?: string;
    filename?: string;
    size?: number;
    mime?: string;
    batchId?: string;
    /** Set when the client explicitly chose "keep duplicates" (see
     * /api/upload/check's "keep" response) -- storageKey is the *existing* asset's
     * key, reused rather than freshly uploaded (content-addressed, so there's
     * nothing new to store), but this should still create its own independent
     * asset row rather than being folded into that existing one. */
    forceNewCopy?: boolean;
  };
  const { storageKey, uploadId, parts, sha256, filename, size, mime, batchId, forceNewCopy } = body;

  if (!storageKey || !sha256 || !filename || !size || !mime) {
    return NextResponse.json(
      { error: "storageKey, sha256, filename, size, mime required" },
      { status: 400 },
    );
  }

  const kind = classifyKind(filename);
  if (!kind) {
    return NextResponse.json({ error: `unrecognized file type: ${filename}` }, { status: 400 });
  }

  if (uploadId && parts?.length) {
    await completeMultipartUpload(storageKey, uploadId, parts);
  }

  const head = await headObject(storageKey);
  if (!head.exists) {
    return NextResponse.json({ error: "upload did not reach storage" }, { status: 502 });
  }
  if (head.size !== size) {
    return NextResponse.json(
      { error: `size mismatch: claimed ${size}, stored ${head.size}` },
      { status: 502 },
    );
  }

  // Dedup: an existing asset with this sha256 means the content is already in the
  // library (brief section 5 — "re-uploading a file is a no-op that returns the
  // existing asset") -- unless the caller explicitly asked to keep this as a second,
  // independent copy (forceNewCopy), in which case that check is skipped entirely
  // and this always inserts a fresh row.
  //
  // Not ON CONFLICT anymore: sha256 stopped being a unique constraint when "keep
  // duplicates" was added (an intentional duplicate needs the column non-unique),
  // so Postgres has nothing for ON CONFLICT to target. This check-then-insert has a
  // narrow race window (two concurrent uploads of the exact same never-before-seen
  // file could both insert) that the old ON CONFLICT closed, but /api/upload/check
  // already catches the common case before either request gets here, so it's an
  // acceptable tradeoff for a feature that only exists because uniqueness had to go.
  let assetId: string;
  let created = false;

  const existing = forceNewCopy
    ? null
    : await db.query.assets.findFirst({ where: eq(assets.sha256, sha256), columns: { id: true } });

  if (existing) {
    assetId = existing.id;
  } else {
    const [inserted] = await db
      .insert(assets)
      .values({
        sha256,
        originalFilename: filename,
        basename: basenameOf(filename),
        batchId,
        byteSize: size,
        mime,
        kind,
        storageKey,
        status: "pending",
      })
      .returning({ id: assets.id });
    assetId = inserted.id;
    created = true;
  }

  // Only a newly created row gets an ingest job. An existing one already has its job
  // (still pending or processing) or has finished. This used to re-queue any existing
  // row still "pending" -- so the same photo uploaded twice before the first copy was
  // processed (one file twice in a drop, or the same files dropped again mid-batch)
  // got a second job, and the worker processed it twice. 21 photos in the queue had
  // duplicate jobs when this was found.
  const deduped = !created;

  if (deduped) {
    // Already in the library (processed, or with its own job still queued), so nothing
    // more happens for this upload and it counts toward the batch's completed total
    // right away -- the same as /api/upload/check does for duplicates it catches. A
    // newly created file's completedFiles increment happens when the worker finishes it.
    if (batchId) {
      await db
        .update(importBatches)
        .set({ completedFiles: sql`${importBatches.completedFiles} + 1` })
        .where(eq(importBatches.id, batchId));
      await maybeFinalizeBatch(batchId);
    }
  } else {
    await ingestQueue.add("ingest", {
      assetId,
      storageKey,
      originalFilename: filename,
      sha256,
      byteSize: size,
      mime,
      batchId,
    });
  }

  return NextResponse.json({ assetId, deduped });
}
