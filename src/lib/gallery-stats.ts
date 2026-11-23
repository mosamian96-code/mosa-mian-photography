import { and, asc, eq, gte, sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/lib/db";
import { galleryDailyStats } from "@/lib/db/schema";
import { logError } from "@/lib/error-log";

export type StatKind = "views" | "downloads";
export type DailyStat = { day: string; views: number; downloads: number };

/** Link-preview fetchers, crawlers and scripts. A view count is "people who looked",
 * so these are left out; anything without a user agent is too. */
const NON_HUMAN_UA =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|headless|lighthouse|curl|wget|python|axios|node-fetch|go-http/i;

/** False for prefetches (Next's router, the browser's speculation rules) and for
 * non-human user agents. A prefetch isn't a visit: the person may never open it. */
export function isCountableView(headers: Headers) {
  if (headers.get("next-router-prefetch")) return false;
  if (headers.get("purpose") === "prefetch") return false;
  if (/prefetch|prerender/i.test(headers.get("sec-purpose") ?? "")) return false;
  const ua = headers.get("user-agent") ?? "";
  return ua !== "" && !NON_HUMAN_UA.test(ua);
}

/** Adds one to today's (UTC) count. Stats must never break the page or download they
 * describe, so a failed write goes to the error log and is swallowed. */
export async function incrementGalleryStat(galleryId: string, kind: StatKind) {
  try {
    const day = sql`(now() at time zone 'utc')::date`;
    await db
      .insert(galleryDailyStats)
      .values(kind === "views" ? { galleryId, day, views: 1 } : { galleryId, day, downloads: 1 })
      .onConflictDoUpdate({
        target: [galleryDailyStats.galleryId, galleryDailyStats.day],
        set: kind === "views" ? { views: sql`${galleryDailyStats.views} + 1` } : { downloads: sql`${galleryDailyStats.downloads} + 1` },
      });
  } catch (err) {
    await logError("gallery-stats", err);
  }
}

/** Counts after the response has been sent, so the visitor never waits on it. */
export function countGalleryStat(galleryId: string, kind: StatKind) {
  after(() => incrementGalleryStat(galleryId, kind));
}

function utcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** One entry per day, oldest first, ending today (UTC); days with no row are zero. */
export function fillDays(rows: DailyStat[], days: number, today = new Date()) {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: DailyStat[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = utcDay(new Date(today.getTime() - i * 86_400_000));
    out.push(byDay.get(day) ?? { day, views: 0, downloads: 0 });
  }
  return out;
}

export async function loadGalleryStats(galleryId: string, days = 30) {
  const since = utcDay(new Date(Date.now() - (days - 1) * 86_400_000));
  const rows = await db
    .select({ day: galleryDailyStats.day, views: galleryDailyStats.views, downloads: galleryDailyStats.downloads })
    .from(galleryDailyStats)
    .where(and(eq(galleryDailyStats.galleryId, galleryId), gte(galleryDailyStats.day, since)))
    .orderBy(asc(galleryDailyStats.day));
  const filled = fillDays(rows, days);
  return {
    days: filled,
    totalViews: filled.reduce((n, d) => n + d.views, 0),
    totalDownloads: filled.reduce((n, d) => n + d.downloads, 0),
  };
}
