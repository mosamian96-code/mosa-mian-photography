import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, errorLogs, jobs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function timeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function ErrorLogPage() {
  const [recentErrors, failedJobs, failedAssets] = await Promise.all([
    db.select().from(errorLogs).orderBy(desc(errorLogs.createdAt)).limit(100),
    db
      .select({ id: jobs.id, type: jobs.type, error: jobs.error, updatedAt: jobs.updatedAt })
      .from(jobs)
      .where(eq(jobs.status, "failed"))
      .orderBy(desc(jobs.updatedAt))
      .limit(50),
    db
      .select({ id: assets.id, filename: assets.originalFilename, errorMessage: assets.errorMessage })
      .from(assets)
      .where(sql`${assets.status} = 'failed'`)
      .limit(50),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">Error log</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Server-side errors, most recent first. Added tonight so problems surface here instead of requiring SSH
          access to read container logs.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Application errors ({recentErrors.length})
        </h2>
        {recentErrors.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400 dark:text-neutral-500">None recorded.</p>
        ) : (
          <div className="mt-3 divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {recentErrors.map((e) => (
              <details key={e.id} className="px-4 py-3">
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm">
                  <span className="min-w-0 flex-1 truncate text-neutral-900 dark:text-neutral-100">
                    <span className="mr-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                      {e.context}
                    </span>
                    {e.message}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">{timeAgo(e.createdAt)}</span>
                </summary>
                {e.stack ? (
                  <pre className="mt-2 overflow-x-auto rounded bg-neutral-50 p-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                    {e.stack}
                  </pre>
                ) : null}
              </details>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Failed ingest jobs ({failedJobs.length})</h2>
        {failedJobs.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400 dark:text-neutral-500">None.</p>
        ) : (
          <div className="mt-3 divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {failedJobs.map((j) => (
              <div key={j.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-neutral-900 dark:text-neutral-100">{j.type}</span>
                  <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">{timeAgo(j.updatedAt)}</span>
                </div>
                {j.error ? <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{j.error}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Failed assets ({failedAssets.length})</h2>
        {failedAssets.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400 dark:text-neutral-500">None.</p>
        ) : (
          <div className="mt-3 divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {failedAssets.map((a) => (
              <div key={a.id} className="px-4 py-3 text-sm">
                <p className="text-neutral-900 dark:text-neutral-100">{a.filename}</p>
                {a.errorMessage ? <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{a.errorMessage}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
