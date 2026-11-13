/** Display text for client activity in the studio. Pure (no database import), so the
 * client component can use it and it can be tested directly. */

export type ActivityItem = {
  kind: "view" | "favorite" | "unfavorite" | "comment" | "download" | "download_all";
  size: "web" | "original" | null;
  /** Null when the photo has since been deleted (or for events with no photo). */
  filename: string | null;
};

const SIZE_LABEL = { original: "full resolution", web: "web size" } as const;

export function describeActivity({ kind, size, filename }: ActivityItem): string {
  const photo = filename ?? "a photo that's since been removed";
  const sized = size ? ` (${SIZE_LABEL[size]})` : "";
  switch (kind) {
    case "view":
      return "Opened the gallery";
    case "favorite":
      return `Favorited ${photo}`;
    case "unfavorite":
      return `Removed ${photo} from favorites`;
    case "comment":
      return `Commented on ${photo}`;
    case "download":
      return `Downloaded ${photo}${sized}`;
    case "download_all":
      return `Downloaded all photos${sized}`;
  }
}

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago", then a date. */
export function relativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - date.getTime()) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/** One line under a client link: whether the client has opened it, and how much. */
export function linkSummary(link: { lastViewedAt: string | null; viewCount: number; downloadCount: number }, now?: Date) {
  if (!link.lastViewedAt) return "Not opened yet";
  const parts = [`Last opened ${relativeTime(new Date(link.lastViewedAt), now)}`];
  parts.push(`${link.viewCount} visit${link.viewCount === 1 ? "" : "s"}`);
  if (link.downloadCount > 0) parts.push(`${link.downloadCount} download${link.downloadCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
