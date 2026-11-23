import { Queue, type QueueOptions } from "bullmq";
import { redis } from "@/lib/redis";

export const INGEST_QUEUE_NAME = "ingest";

export type IngestJobData = {
  assetId: string;
  storageKey: string;
  originalFilename: string;
  sha256: string;
  byteSize: number;
  mime: string;
  batchId?: string;
};

export const WATERMARK_QUEUE_NAME = "watermark";

export type WatermarkJobData = {
  assetId: string;
  watermarkId: string;
};

const defaultJobOptions: QueueOptions["defaultJobOptions"] = {
  // Section 7: "Three retries with backoff, then failed with the error text
  // surfaced in the admin."
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 60 * 60 * 24 * 7 },
  removeOnFail: false,
};

/** A BullMQ Queue connects to Redis as soon as it's constructed, so creating them at
 * import time made `next build` (which loads every route to collect page data, with
 * no Redis) print a wall of connection errors. Each queue is now created on first
 * use; callers see the same `.add` / `.addBulk` API. */
function lazyQueue<T>(name: string): Pick<Queue<T>, "add" | "addBulk"> {
  let queue: Queue<T> | null = null;
  const get = () => (queue ??= new Queue<T>(name, { connection: redis, defaultJobOptions }));
  return {
    add: ((...args: Parameters<Queue<T>["add"]>) => get().add(...args)) as Queue<T>["add"],
    addBulk: ((...args: Parameters<Queue<T>["addBulk"]>) => get().addBulk(...args)) as Queue<T>["addBulk"],
  };
}

export const ingestQueue = lazyQueue<IngestJobData>(INGEST_QUEUE_NAME);
export const watermarkQueue = lazyQueue<WatermarkJobData>(WATERMARK_QUEUE_NAME);
