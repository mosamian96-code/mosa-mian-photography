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
  };
  const { storageKey, uploadId, parts, sha256, filename, size, mime, batchId } = body;

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

  // Dedup: a unique sha256 already present means this exact file is already in the
  // library (brief section 5 — "re-uploading a file is a no-op that returns the
  // existing asset"). Race-safe via ON CONFLICT rather than a check-then-insert.
  const [asset] = await db
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
    .onConflictDoUpdate({
      target: assets.sha256,
      set: { sha256 },
    })
    .returning({ id: assets.id, status: assets.status });

  const deduped = asset.status !== "pending";

  if (deduped) {
    // Already fully ingested previously — nothing more will happen for this file, so
    // it counts toward the batch's completed total right away. A non-deduped file's
    // completedFiles increment happens when the worker actually finishes ingesting it.
    if (batchId) {
      await db
        .update(importBatches)
        .set({ completedFiles: sql`${importBatches.completedFiles} + 1` })
        .where(eq(importBatches.id, batchId));
      await maybeFinalizeBatch(batchId);
    }
  } else {
    await ingestQueue.add("ingest", {
      assetId: asset.id,
      storageKey,
      originalFilename: filename,
      sha256,
      byteSize: size,
      mime,
      batchId,
    });
  }

  return NextResponse.json({ assetId: asset.id, deduped });
}
