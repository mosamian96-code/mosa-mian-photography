import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/error-log", () => ({ logError: vi.fn(async () => {}) }));

const { fillDays, isCountableView } = await import("./gallery-stats");

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

describe("isCountableView", () => {
  it("counts an ordinary browser visit", () => {
    expect(isCountableView(new Headers({ "user-agent": CHROME }))).toBe(true);
  });

  it("skips prefetches", () => {
    expect(isCountableView(new Headers({ "user-agent": CHROME, "next-router-prefetch": "1" }))).toBe(false);
    expect(isCountableView(new Headers({ "user-agent": CHROME, "sec-purpose": "prefetch;prerender" }))).toBe(false);
    expect(isCountableView(new Headers({ "user-agent": CHROME, purpose: "prefetch" }))).toBe(false);
  });

  it("skips crawlers, link previews and requests with no user agent", () => {
    expect(isCountableView(new Headers({ "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" }))).toBe(false);
    expect(isCountableView(new Headers({ "user-agent": "WhatsApp/2.23" }))).toBe(false);
    expect(isCountableView(new Headers({ "user-agent": "facebookexternalhit/1.1" }))).toBe(false);
    expect(isCountableView(new Headers())).toBe(false);
  });
});

describe("fillDays", () => {
  it("returns one entry per day ending today, with zeros for missing days", () => {
    const today = new Date("2026-11-23T10:00:00Z");
    const days = fillDays([{ day: "2026-11-22", views: 4, downloads: 1 }], 3, today);
    expect(days).toEqual([
      { day: "2026-11-21", views: 0, downloads: 0 },
      { day: "2026-11-22", views: 4, downloads: 1 },
      { day: "2026-11-23", views: 0, downloads: 0 },
    ]);
  });
});
