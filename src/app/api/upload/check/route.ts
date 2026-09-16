import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets, importBatches } from "@/lib/db/schema";
import { maybeFinalizeBatch } from "@/lib/ingest/batch";
import { requireAdminSession } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Checked before a file is uploaded at all — dedup by content hash, not just at
// insert time, so re-dragging an overlapping drive folder doesn't burn bandwidth
// re-uploading bytes B2 already has (brief section 5).
//
// mode "skip" (default) is the original behavior: an existing match means this file
// is done, full stop, and the client never uploads or calls /complete for it. mode
// "keep" means the caller explicitly wants a second, independent library entry for
// this content -- the byte upload is still skipped (content-addressed storage means
// there's nothing new to upload), but the existing asset's storageKey comes back so
// the client can call /complete with forceNewCopy to create that second row.
export async function POST(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { sha256, batchId, mode } = (await req.json()) as {
    sha256?: string;
    batchId?: string;
    mode?: "skip" | "keep";
  };
  if (!sha256) return NextResponse.json({ error: "sha256 required" }, { status: 400 });

  const existing = await db.query.assets.findFirst({
    where: eq(assets.sha256, sha256),
    columns: {
      id: true,
      status: true,
      originalFilename: true,
      groupId: true,
      isGroupPrimary: true,
      storageKey: true,
    },
  });

  const keep = mode === "keep" && Boolean(existing);

  // A duplicate caught here never reaches /api/upload/complete when skipped (the
  // client skips the upload entirely to save bandwidth), so this is the only place
  // that can count it toward the batch in that case — otherwise completedFiles would
  // never reach totalFiles and the batch would stay stuck at "uploading" forever. A
  // "keep" duplicate still goes on to call /complete, which does its own counting.
  if (existing && batchId && !keep) {
    await db
      .update(importBatches)
      .set({ completedFiles: sql`${importBatches.completedFiles} + 1` })
      .where(eq(importBatches.id, batchId));
    await maybeFinalizeBatch(batchId);
  }

  return NextResponse.json({
    exists: Boolean(existing),
    keep,
    assetId: existing?.id,
    status: existing?.status,
    groupId: existing?.groupId,
    isGroupPrimary: existing?.isGroupPrimary,
    storageKey: existing?.storageKey,
  });
}
