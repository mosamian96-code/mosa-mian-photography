import { eq, sql } from "drizzle-orm";
import { exiftool } from "exiftool-vendored";
import { Worker } from "bullmq";
import { db } from "@/lib/db";
import { importBatches, jobs } from "@/lib/db/schema";
import { maybeFinalizeBatch } from "@/lib/ingest/batch";
import { INGEST_QUEUE_NAME, type IngestJobData } from "@/lib/queue";
import { redis } from "@/lib/redis";
import { processIngestJob } from "./process-ingest";

// Modest concurrency: the VPS is a 2 vCPU / 4 GB box shared with Postgres, Redis, and
// the app server. sharp and exiftool are both CPU/memory-heavy per job.
const CONCURRENCY = 2;

const worker = new Worker<IngestJobData>(INGEST_QUEUE_NAME, processIngestJob, {
  connection: redis,
  concurrency: CONCURRENCY,
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
  // BullMQ retries automatically up to the queue's configured attempts; only mark the
  // batch/job row as failed once every attempt is exhausted.
  if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await upsertJobRow(job.data, "failed", err.message);
    if (job.data.batchId) {
      await db
        .update(importBatches)
        .set({ failedFiles: sql`${importBatches.failedFiles} + 1` })
        .where(eq(importBatches.id, job.data.batchId));
      await maybeFinalizeBatch(job.data.batchId);
    }
  }
});

console.log(`[ingest worker] listening on queue "${INGEST_QUEUE_NAME}", concurrency ${CONCURRENCY}`);

async function shutdown() {
  console.log("[ingest worker] shutting down...");
  await worker.close();
  await exiftool.end();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
