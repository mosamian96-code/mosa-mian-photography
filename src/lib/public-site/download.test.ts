import { describe, expect, it, vi } from "vitest";

// resolveDownloadSize and zipNameFor are pure; the module's database import is only
// used by resolveDownloadTarget.
vi.mock("@/lib/db", () => ({ db: {} }));

const { resolveDownloadSize, zipNameFor } = await import("./download");

describe("resolveDownloadSize", () => {
  it("gives a request with no size the largest the gallery allows", () => {
    expect(resolveDownloadSize("original", null)).toEqual({ ok: true, size: "original" });
    expect(resolveDownloadSize("web", null)).toEqual({ ok: true, size: "web" });
    expect(resolveDownloadSize("original", "")).toEqual({ ok: true, size: "original" });
  });

  it("allows web size whenever downloads are on", () => {
    expect(resolveDownloadSize("original", "web")).toEqual({ ok: true, size: "web" });
    expect(resolveDownloadSize("web", "web")).toEqual({ ok: true, size: "web" });
  });

  it("allows full resolution only when the gallery offers originals", () => {
    expect(resolveDownloadSize("original", "original")).toEqual({ ok: true, size: "original" });
    expect(resolveDownloadSize("web", "original")).toMatchObject({ ok: false, status: 403 });
  });

  it("rejects an unknown size", () => {
    expect(resolveDownloadSize("original", "huge")).toMatchObject({ ok: false, status: 400 });
    expect(resolveDownloadSize("original", "ORIGINAL")).toMatchObject({ ok: false, status: 400 });
  });
});

describe("zipNameFor", () => {
  it("marks web-size zips so they can't be mistaken for the originals", () => {
    expect(zipNameFor("smith-wedding", "original")).toBe("smith-wedding");
    expect(zipNameFor("smith-wedding", "web")).toBe("smith-wedding-web-size");
  });
});
