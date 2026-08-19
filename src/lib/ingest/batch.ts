import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { importBatches } from "@/lib/db/schema";

/**
 * Flips a batch to "done"/"failed" once every file it was told about (totalFiles) has
 * either finished ingesting or been counted as an already-existing duplicate. Called
 * from every place that can be the *last* file in a batch to finish: the worker
 * (ingest completed/failed) and the two dedup short-circuits that never reach the
 * worker at all (a pre-upload /check hit, and a post-upload dedup in /complete).
 */
export async function maybeFinalizeBatch(batchId: string) {
  const batch = await db.query.importBatches.findFirst({ where: eq(importBatches.id, batchId) });
  if (!batch) return;
  if (batch.status === "done" || batch.status === "failed") return;
  if (batch.completedFiles + batch.failedFiles >= batch.totalFiles) {
    await db
      .update(importBatches)
      .set({ status: batch.failedFiles > 0 ? "failed" : "done" })
      .where(eq(importBatches.id, batchId));
  }
}
