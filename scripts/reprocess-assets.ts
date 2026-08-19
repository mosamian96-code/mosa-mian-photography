/**
 * One-off ops script: re-queues every asset for ingest, regardless of current status.
 * Use after a derivative-generation bug fix (like the EXIF-orientation fix) so
 * already-ingested assets get their derivatives regenerated instead of staying wrong
 * until someone re-uploads them.
 *
 * Run via: docker compose run --rm migrate npx tsx scripts/reprocess-assets.ts
 */
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { assets } from "../src/lib/db/schema";
import { ingestQueue } from "../src/lib/queue";

async function main() {
  const rows = await db
    .select({
      id: assets.id,
      storageKey: assets.storageKey,
      originalFilename: assets.originalFilename,
      sha256: assets.sha256,
      byteSize: assets.byteSize,
      mime: assets.mime,
      batchId: assets.batchId,
    })
    .from(assets);

  for (const row of rows) {
    // The worker's idempotency guard skips anything already "ready" -- reset first so
    // this actually reprocesses instead of no-op'ing.
    await db.update(assets).set({ status: "pending" }).where(eq(assets.id, row.id));
    await ingestQueue.add("ingest", {
      assetId: row.id,
      storageKey: row.storageKey,
      originalFilename: row.originalFilename,
      sha256: row.sha256,
      byteSize: row.byteSize,
      mime: row.mime,
      batchId: row.batchId ?? undefined,
    });
  }

  console.log(`re-queued ${rows.length} asset(s) for ingest`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
