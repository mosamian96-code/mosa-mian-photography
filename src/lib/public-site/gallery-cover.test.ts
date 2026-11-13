import { describe, expect, it } from "vitest";
import { formatCaptureRange, pickCoverImage } from "./gallery-cover";
import type { GalleryImage } from "./resolve";

const image = (assetId: string, urls: Record<string, string> = { webp2560: `/${assetId}.webp` }): GalleryImage => ({
  assetId,
  filename: `${assetId}.jpg`,
  kind: "jpeg",
  width: 3000,
  height: 2000,
  lqip: null,
  caption: null,
  capturedAt: null,
  camera: null,
  lens: null,
  iso: null,
  shutter: null,
  aperture: null,
  gpsLat: null,
  gpsLon: null,
  urls,
});

describe("pickCoverImage", () => {
  it("uses the chosen cover", () => {
    expect(pickCoverImage([image("a"), image("b")], "b")?.assetId).toBe("b");
  });

  it("falls back to the first displayable photo when the cover is missing or still processing", () => {
    expect(pickCoverImage([image("a"), image("b")], null)?.assetId).toBe("a");
    expect(pickCoverImage([image("a", {}), image("b")], "a")?.assetId).toBe("b");
  });

  it("returns null when nothing is displayable yet", () => {
    expect(pickCoverImage([], null)).toBeNull();
    expect(pickCoverImage([image("a", {})], null)).toBeNull();
  });
});

describe("formatCaptureRange", () => {
  it("formats a single day", () => {
    expect(formatCaptureRange(["2026-09-21T10:00:00.000Z", "2026-09-21T18:30:00.000Z"])).toBe("21 September 2026");
  });

  it("formats ranges within a month, across months, and across years", () => {
    expect(formatCaptureRange(["2026-09-21T10:00:00Z", "2026-09-23T10:00:00Z"])).toBe("21–23 September 2026");
    expect(formatCaptureRange(["2026-09-28T10:00:00Z", "2026-10-02T10:00:00Z"])).toBe("28 September – 2 October 2026");
    expect(formatCaptureRange(["2025-12-30T10:00:00Z", "2026-01-02T10:00:00Z"])).toBe("30 December 2025 – 2 January 2026");
  });

  it("describes long spans by month", () => {
    expect(formatCaptureRange(["2026-05-01T10:00:00Z", "2026-05-29T10:00:00Z"])).toBe("May 2026");
    expect(formatCaptureRange(["2026-05-01T10:00:00Z", "2026-08-10T10:00:00Z"])).toBe("May – August 2026");
    expect(formatCaptureRange(["2025-11-01T10:00:00Z", "2026-02-10T10:00:00Z"])).toBe("November 2025 – February 2026");
  });

  it("ignores a stray outlier, like one old screenshot in a wedding gallery", () => {
    const wedding = Array.from({ length: 40 }, (_, i) => `2026-09-21T${String(10 + (i % 8)).padStart(2, "0")}:00:00Z`);
    expect(formatCaptureRange([...wedding, "2019-03-01T10:00:00Z"])).toBe("21 September 2026");
  });

  it("skips missing and invalid dates, and returns null when none remain", () => {
    expect(formatCaptureRange([null, "not a date", "2026-09-21T10:00:00Z"])).toBe("21 September 2026");
    expect(formatCaptureRange([null])).toBeNull();
  });
});
