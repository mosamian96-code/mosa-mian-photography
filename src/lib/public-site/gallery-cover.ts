import type { GalleryImage } from "./resolve";

const hasImage = (img: GalleryImage) => Boolean(img.urls.webp2560 ?? img.urls.webp1200);

/** The gallery's chosen cover if it has a displayable image, else its first photo
 * (or video poster) that does. Null for an empty gallery, or one whose photos are all
 * still processing. */
export function pickCoverImage(images: GalleryImage[], coverAssetId: string | null): GalleryImage | null {
  return images.find((img) => img.assetId === coverAssetId && hasImage(img)) ?? images.find(hasImage) ?? null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parts(date: Date) {
  return {
    day: date.getUTCDate(),
    month: date.toLocaleString("en-GB", { month: "long", timeZone: "UTC" }),
    year: date.getUTCFullYear(),
  };
}

/**
 * Words a gallery's date from its photos' capture times: "21 September 2026",
 * "21–23 September 2026", "28 September – 2 October 2026". The outer 5% at each end
 * are ignored, so one stray old photo or screenshot can't stretch the range, and a
 * gallery spanning more than two weeks is described by month instead. Capture times
 * are camera-local, stored without a zone, so they're read as UTC to avoid shifting.
 */
export function formatCaptureRange(capturedAt: (string | null)[]): string | null {
  const times = capturedAt
    .filter((t): t is string => Boolean(t))
    .map((t) => new Date(t).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (times.length === 0) return null;

  const trim = Math.floor(times.length * 0.05);
  const start = parts(new Date(times[trim]));
  const end = parts(new Date(times[times.length - 1 - trim]));
  const spanDays = (times[times.length - 1 - trim] - times[trim]) / DAY_MS;

  if (spanDays > 14) {
    if (start.year === end.year) {
      return start.month === end.month ? `${start.month} ${start.year}` : `${start.month} – ${end.month} ${end.year}`;
    }
    return `${start.month} ${start.year} – ${end.month} ${end.year}`;
  }
  if (start.year !== end.year) return `${start.day} ${start.month} ${start.year} – ${end.day} ${end.month} ${end.year}`;
  if (start.month !== end.month) return `${start.day} ${start.month} – ${end.day} ${end.month} ${end.year}`;
  if (start.day !== end.day) return `${start.day}–${end.day} ${end.month} ${end.year}`;
  return `${start.day} ${start.month} ${start.year}`;
}
