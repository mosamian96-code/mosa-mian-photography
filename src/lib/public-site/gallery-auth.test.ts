import { beforeAll, describe, expect, it } from "vitest";
import { gallerySessionCookieValue, isGalleryLive, publicVisitorCanViewGallery, verifyGalleryToken } from "./gallery-auth";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
});

const base = {
  id: "g1",
  visibility: "public" as const,
  publishedAt: new Date("2026-01-01"),
  expiresAt: null as Date | null,
  passwordHash: null as string | null,
};

describe("isGalleryLive", () => {
  it("needs a publish date and no past expiry", () => {
    const now = new Date("2026-06-01");
    expect(isGalleryLive(base, now)).toBe(true);
    expect(isGalleryLive({ ...base, publishedAt: null }, now)).toBe(false);
    expect(isGalleryLive({ ...base, expiresAt: new Date("2026-05-01") }, now)).toBe(false);
    expect(isGalleryLive({ ...base, expiresAt: new Date("2026-07-01") }, now)).toBe(true);
  });
});

describe("password unlock cookie", () => {
  it("is tied to the current password", () => {
    const gallery = { id: "g1", passwordHash: "salt:old" };
    const cookie = gallerySessionCookieValue("g1", "salt:old");
    expect(verifyGalleryToken(gallery, cookie)).toBe(true);
    // Changing the password locks out the old unlock.
    expect(verifyGalleryToken({ ...gallery, passwordHash: "salt:new" }, cookie)).toBe(false);
  });

  it("is tied to the gallery", () => {
    const cookie = gallerySessionCookieValue("g1", "salt:x");
    expect(verifyGalleryToken({ id: "g2", passwordHash: "salt:x" }, cookie)).toBe(false);
  });
});

describe("publicVisitorCanViewGallery", () => {
  it("never opens private, unpublished or expired galleries", () => {
    expect(publicVisitorCanViewGallery({ ...base, visibility: "private" }, undefined)).toBe(false);
    expect(publicVisitorCanViewGallery({ ...base, publishedAt: null }, undefined)).toBe(false);
    expect(publicVisitorCanViewGallery({ ...base, expiresAt: new Date("2000-01-01") }, undefined)).toBe(false);
  });

  it("opens public and unlisted galleries", () => {
    expect(publicVisitorCanViewGallery(base, undefined)).toBe(true);
    expect(publicVisitorCanViewGallery({ ...base, visibility: "unlisted" }, undefined)).toBe(true);
  });

  it("opens a password gallery only with a matching cookie", () => {
    const gallery = { ...base, visibility: "password" as const, passwordHash: "salt:pw" };
    expect(publicVisitorCanViewGallery(gallery, undefined)).toBe(false);
    expect(publicVisitorCanViewGallery(gallery, gallerySessionCookieValue("g1", "salt:pw"))).toBe(true);
  });
});
