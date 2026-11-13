import { describe, expect, it } from "vitest";
import { describeActivity, linkSummary, relativeTime } from "./client-activity-format";

describe("describeActivity", () => {
  it("names the photo and, for downloads, the size", () => {
    expect(describeActivity({ kind: "view", size: null, filename: null })).toBe("Opened the gallery");
    expect(describeActivity({ kind: "favorite", size: null, filename: "IMG_1.jpg" })).toBe("Favorited IMG_1.jpg");
    expect(describeActivity({ kind: "unfavorite", size: null, filename: "IMG_1.jpg" })).toBe(
      "Removed IMG_1.jpg from favorites",
    );
    expect(describeActivity({ kind: "comment", size: null, filename: "IMG_1.jpg" })).toBe("Commented on IMG_1.jpg");
    expect(describeActivity({ kind: "download", size: "original", filename: "IMG_1.CR3" })).toBe(
      "Downloaded IMG_1.CR3 (full resolution)",
    );
    expect(describeActivity({ kind: "download_all", size: "web", filename: null })).toBe(
      "Downloaded all photos (web size)",
    );
  });

  it("still reads when the photo has been deleted since", () => {
    expect(describeActivity({ kind: "favorite", size: null, filename: null })).toBe(
      "Favorited a photo that's since been removed",
    );
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-11-13T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it("steps from minutes to hours to days to a date", () => {
    expect(relativeTime(ago(20_000), now)).toBe("just now");
    expect(relativeTime(ago(MIN), now)).toBe("1 minute ago");
    expect(relativeTime(ago(45 * MIN), now)).toBe("45 minutes ago");
    expect(relativeTime(ago(HOUR), now)).toBe("1 hour ago");
    expect(relativeTime(ago(23 * HOUR), now)).toBe("23 hours ago");
    expect(relativeTime(ago(DAY + HOUR), now)).toBe("yesterday");
    expect(relativeTime(ago(6 * DAY), now)).toBe("6 days ago");
    expect(relativeTime(new Date("2026-10-02T09:00:00Z"), now)).toBe("2 Oct");
    expect(relativeTime(new Date("2025-10-02T09:00:00Z"), now)).toBe("2 Oct 2025");
  });

  it("treats a timestamp slightly ahead of this clock as just now", () => {
    expect(relativeTime(new Date(now.getTime() + 5_000), now)).toBe("just now");
  });
});

describe("linkSummary", () => {
  const now = new Date("2026-11-13T12:00:00Z");

  it("says when a link hasn't been opened", () => {
    expect(linkSummary({ lastViewedAt: null, viewCount: 0, downloadCount: 0 }, now)).toBe("Not opened yet");
  });

  it("summarizes visits and downloads", () => {
    expect(linkSummary({ lastViewedAt: "2026-11-13T09:00:00Z", viewCount: 1, downloadCount: 0 }, now)).toBe(
      "Last opened 3 hours ago · 1 visit",
    );
    expect(linkSummary({ lastViewedAt: "2026-11-13T09:00:00Z", viewCount: 4, downloadCount: 2 }, now)).toBe(
      "Last opened 3 hours ago · 4 visits · 2 downloads",
    );
  });
});
