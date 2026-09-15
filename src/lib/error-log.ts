import { db } from "@/lib/db";
import { errorLogs } from "@/lib/db/schema";

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
