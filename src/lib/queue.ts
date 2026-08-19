import { Queue } from "bullmq";
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

export const ingestQueue = new Queue<IngestJobData>(INGEST_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    // Section 7: "Three retries with backoff, then failed with the error text
    // surfaced in the admin."
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 60 * 60 * 24 * 7 },
    removeOnFail: false,
  },
});
