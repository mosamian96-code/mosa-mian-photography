import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { ingestQueue } from "@/lib/queue";
import { requireAdminSession } from "@/lib/require-admin";
import { withErrorLogging } from "@/lib/with-error-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Re-queues failed photos for processing -- every failed one, or just `assetIds`.
 * A failed ingest job has already used up BullMQ's own retries, so after a fix
 * ships, the photos it hit stay failed until something queues them again. */
export const POST = withErrorLogging("library-retry-failed", async (req: NextRequest) => {
  const { response } = await requireAdminSession();
  if (response) return response;

  const body = (await req.json().catch(() => ({}))) as { assetIds?: unknown };
  const assetIds = Array.isArray(body.assetIds) ? body.assetIds.filter((id): id is string => typeof id === "string") : null;
  if (assetIds && assetIds.length === 0) return NextResponse.json({ retried: 0 });

  const conditions = [eq(assets.status, "failed"), isNull(assets.deletedAt)];
  if (assetIds) conditions.push(inArray(assets.id, assetIds));

  const failed = await db
    .update(assets)
    .set({ status: "pending", errorMessage: null })
    .where(and(...conditions))
    .returning({
      id: assets.id,
      storageKey: assets.storageKey,
      originalFilename: assets.originalFilename,
      sha256: assets.sha256,
      byteSize: assets.byteSize,
      mime: assets.mime,
      batchId: assets.batchId,
    });

  await ingestQueue.addBulk(
    failed.map((a) => ({
      name: "ingest",
      data: {
        assetId: a.id,
        storageKey: a.storageKey,
        originalFilename: a.originalFilename,
        sha256: a.sha256,
        byteSize: Number(a.byteSize),
        mime: a.mime,
        batchId: a.batchId ?? undefined,
      },
    })),
  );

  return NextResponse.json({ retried: failed.length });
});
