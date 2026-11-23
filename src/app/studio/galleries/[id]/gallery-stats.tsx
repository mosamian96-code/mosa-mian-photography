"use client";

import { useEffect, useState } from "react";

type DailyStat = { day: string; views: number; downloads: number };
type Stats = { days: DailyStat[]; totalViews: number; totalDownloads: number };

function shortDate(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Views and downloads over the last 30 days. Views are page opens by people (not
 * crawlers or link prefetches) on the public gallery and on client links; a zip counts
 * as one download. Achromatic like the rest of the studio: one bar per day. */
export function GalleryStatsSection({ galleryId }: { galleryId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/galleries/${galleryId}/stats`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Stats>) : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [galleryId]);

  const peak = stats ? Math.max(1, ...stats.days.map((d) => d.views)) : 1;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Last 30 days</h2>
      {failed ? (
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">Stats couldn&apos;t load.</p>
      ) : !stats ? (
        <div className="mt-3 h-24 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
      ) : (
        <div className="mt-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
          <dl className="flex gap-8 text-sm">
            <div>
              <dt className="text-xs text-neutral-500 dark:text-neutral-400">Views</dt>
              <dd className="mt-0.5 text-lg tabular-nums text-neutral-900 dark:text-neutral-100" data-testid="stats-views">
                {stats.totalViews}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500 dark:text-neutral-400">Downloads</dt>
              <dd className="mt-0.5 text-lg tabular-nums text-neutral-900 dark:text-neutral-100" data-testid="stats-downloads">
                {stats.totalDownloads}
              </dd>
            </div>
          </dl>
          <div
            role="img"
            aria-label={`Daily views over the last 30 days, peaking at ${stats.totalViews ? peak : 0} a day`}
            className="mt-4 flex h-16 items-end gap-0.5"
          >
            {stats.days.map((d) => (
              <div
                key={d.day}
                title={`${shortDate(d.day)}: ${d.views} view${d.views === 1 ? "" : "s"}, ${d.downloads} download${d.downloads === 1 ? "" : "s"}`}
                className="flex-1 bg-neutral-800 dark:bg-neutral-300"
                style={{ height: d.views ? `${Math.max(6, (d.views / peak) * 100)}%` : "2px", opacity: d.views ? 1 : 0.25 }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-neutral-400 dark:text-neutral-500">
            <span>{shortDate(stats.days[0].day)}</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </section>
  );
}
