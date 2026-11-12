import { and, eq, ne, sql } from "drizzle-orm";
import { exiftool } from "exiftool-vendored";
import { Worker } from "bullmq";
import { db } from "@/lib/db";
import { assets, importBatches, jobs } from "@/lib/db/schema";
import { maybeFinalizeBatch } from "@/lib/ingest/batch";
import { INGEST_QUEUE_NAME, WATERMARK_QUEUE_NAME, type IngestJobData, type WatermarkJobData } from "@/lib/queue";
import { redis } from "@/lib/redis";
import { processIngestJob } from "./process-ingest";
import { processWatermarkJob } from "./process-watermark";

// Modest concurrency: the VPS is a 2 vCPU / 4 GB box shared with Postgres, Redis, and
// the app server. sharp and exiftool are both CPU/memory-heavy per job.
const CONCURRENCY = 2;

const worker = new Worker<IngestJobData>(INGEST_QUEUE_NAME, processIngestJob, {
  connection: redis,
  concurrency: CONCURRENCY,
});

// Lower concurrency: watermark jobs are background/bulk (a whole gallery toggled at
// once) rather than latency-sensitive, so they shouldn't compete hard with ingest.
const watermarkWorker = new Worker<WatermarkJobData>(WATERMARK_QUEUE_NAME, processWatermarkJob, {
  connection: redis,
  concurrency: 1,
});

watermarkWorker.on("failed", (job, err) => {
  if (!job) return;
  console.error(`[watermark] job ${job.id} (asset ${job.data.assetId}) failed:`, err);
});

async function upsertJobRow(data: IngestJobData, status: "active" | "completed" | "failed", error?: string) {
  const existing = await db.query.jobs.findFirst({ where: eq(jobs.assetId, data.assetId) });
  if (existing) {
    await db
      .update(jobs)
      .set({
        status,
        error: error ?? null,
        attempts: status === "active" ? existing.attempts + 1 : existing.attempts,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, existing.id));
  } else {
    await db.insert(jobs).values({
      assetId: data.assetId,
      batchId: data.batchId,
      type: "ingest",
      status,
      attempts: 1,
      error: error ?? null,
    });
  }
}

worker.on("active", (job) => {
  void upsertJobRow(job.data, "active");
});

worker.on("completed", async (job) => {
  await upsertJobRow(job.data, "completed");
  if (job.data.batchId) {
    await db
      .update(importBatches)
      .set({ completedFiles: sql`${importBatches.completedFiles} + 1` })
      .where(eq(importBatches.id, job.data.batchId));
    await maybeFinalizeBatch(job.data.batchId);
  }
});

worker.on("failed", async (job, err) => {
  if (!job) return;
  console.error(`[ingest] job ${job.id} (asset ${job.data.assetId}) failed:`, err);
  // Act only once BullMQ has given up; a job it will retry is back in wait/delayed.
  // The job's state is the source of truth, not attemptsMade: a job that stalled too
  // often (its process killed mid-job) fails as unrecoverable before reaching the
  // attempt limit, and the old attemptsMade check skipped it.
  if ((await job.getState()) !== "failed") return;
  await upsertJobRow(job.data, "failed", err.message);
  // processIngestJob marks the asset failed itself, but a job whose process died never
  // reaches that code, which left the photo stuck at "processing" -- never failed, so
  // never offered for retry.
  await db
    .update(assets)
    .set({ status: "failed", errorMessage: err.message })
    .where(and(eq(assets.id, job.data.assetId), ne(assets.status, "ready")));
  if (job.data.batchId) {
    await db
      .update(importBatches)
      .set({ failedFiles: sql`${importBatches.failedFiles} + 1` })
      .where(eq(importBatches.id, job.data.batchId));
    await maybeFinalizeBatch(job.data.batchId);
  }
});

console.log(`[ingest worker] listening on queue "${INGEST_QUEUE_NAME}", concurrency ${CONCURRENCY}`);
console.log(`[watermark worker] listening on queue "${WATERMARK_QUEUE_NAME}", concurrency 1`);

async function shutdown() {
  console.log("[ingest worker] shutting down...");
  await Promise.all([worker.close(), watermarkWorker.close()]);
  await exiftool.end();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
