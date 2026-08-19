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
export async function POST(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { sha256, batchId } = (await req.json()) as { sha256?: string; batchId?: string };
  if (!sha256) return NextResponse.json({ error: "sha256 required" }, { status: 400 });

  const existing = await db.query.assets.findFirst({
    where: eq(assets.sha256, sha256),
    columns: { id: true, status: true, originalFilename: true },
  });

  // A duplicate caught here never reaches /api/upload/complete (the client skips the
  // upload entirely to save bandwidth), so this is the only place that can count it
  // toward the batch — otherwise completedFiles would never reach totalFiles and the
  // batch would stay stuck at "uploading" forever.
  if (existing && batchId) {
    await db
      .update(importBatches)
      .set({ completedFiles: sql`${importBatches.completedFiles} + 1` })
      .where(eq(importBatches.id, batchId));
    await maybeFinalizeBatch(batchId);
  }

  return NextResponse.json({
    exists: Boolean(existing),
    assetId: existing?.id,
    status: existing?.status,
  });
}
