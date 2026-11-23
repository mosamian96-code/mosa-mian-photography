import { lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { errorLogs } from "@/lib/db/schema";

/** Entries older than this are deleted daily by the worker, so the table (which public
 * endpoints can write to) can't grow without bound. */
export const ERROR_LOG_RETENTION_DAYS = 90;

export async function pruneErrorLog(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ERROR_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db.delete(errorLogs).where(lt(errorLogs.createdAt, cutoff)).returning({ id: errorLogs.id });
  return deleted.length;
}

/** Persists a server-side error so it's visible at /studio/error-log instead of
 * only in `docker compose logs`, which requires SSH access to read. Never throws:
 * a broken error logger must not turn a handled failure into an unhandled one, so
 * a DB write failure here is swallowed (and still goes to console as a fallback). */
export async function logError(context: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(`[${context}]`, error);
  try {
    await db.insert(errorLogs).values({ context, message, stack });
  } catch (err) {
    console.error("[error-log] failed to persist error log entry", err);
  }
}
