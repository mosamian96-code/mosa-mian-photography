import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, errorLogs, jobs } from "@/lib/db/schema";
import { RetryButton } from "./retry-button";

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
  const failedAssetFilter = and(eq(assets.status, "failed"), isNull(assets.deletedAt));
  const [recentErrors, failedJobs, failedAssets, [{ failedTotal }]] = await Promise.all([
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
      .where(failedAssetFilter)
      .limit(50),
    db.select({ failedTotal: count() }).from(assets).where(failedAssetFilter),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">Error log</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Server-side errors, most recent first.</p>
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
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Failed photos ({failedTotal})</h2>
          {failedTotal > 0 ? <RetryButton label={`Retry all ${failedTotal}`} /> : null}
        </div>
        {failedAssets.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400 dark:text-neutral-500">None.</p>
        ) : (
          <div className="mt-3 divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {failedAssets.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-neutral-900 dark:text-neutral-100">{a.filename}</p>
                  {a.errorMessage ? (
                    <p className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">{a.errorMessage}</p>
                  ) : null}
                </div>
                <RetryButton assetIds={[a.id]} label="Retry" />
              </div>
            ))}
          </div>
        )}
        {failedTotal > failedAssets.length ? (
          <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
            Showing {failedAssets.length} of {failedTotal}. &ldquo;Retry all&rdquo; covers every one.
          </p>
        ) : null}
      </section>
    </div>
  );
}
