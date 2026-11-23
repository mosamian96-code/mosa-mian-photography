import { createHmac, timingSafeEqual } from "node:crypto";

/** The unlock cookie signs the gallery id *and* its current password hash, so changing
 * a gallery's password locks out everyone who unlocked it with the old one. (It used to
 * sign the id alone, which kept old unlocks working for their full 30 days.) */
function signGalleryToken(galleryId: string, passwordHash: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET!).update(`${galleryId}:${passwordHash}`).digest("hex");
}

export function gallerySessionCookieName(galleryId: string) {
  return `mmp_gallery_${galleryId}`;
}

export function gallerySessionCookieValue(galleryId: string, passwordHash: string) {
  return signGalleryToken(galleryId, passwordHash);
}

export function verifyGalleryToken(
  gallery: { id: string; passwordHash: string | null },
  token: string | undefined,
): boolean {
  if (!token || !gallery.passwordHash) return false;
  const expected = Buffer.from(signGalleryToken(gallery.id, gallery.passwordHash));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Whether a gallery is live right now: published and not past its expiry date. */
export function isGalleryLive(gallery: { publishedAt: Date | null; expiresAt: Date | null }, now = new Date()): boolean {
  return Boolean(gallery.publishedAt) && !(gallery.expiresAt && gallery.expiresAt <= now);
}

/** Same authorization a visitor needs to view the gallery page itself (see
 * resolvePath and [...path]/page.tsx) -- an unpublished or expired gallery is never
 * visible, "private" means client-link-only and is never satisfied this way,
 * "password" needs the same signed cookie the password form sets, and public/unlisted
 * need nothing beyond knowing the URL. Reused by the public download, zip and video
 * routes so "can download" or "can play" never exceeds "can view". */
export function publicVisitorCanViewGallery(
  gallery: {
    id: string;
    visibility: "public" | "unlisted" | "password" | "private";
    publishedAt: Date | null;
    expiresAt: Date | null;
    passwordHash: string | null;
  },
  passwordCookieValue: string | undefined,
): boolean {
  if (!isGalleryLive(gallery) || gallery.visibility === "private") return false;
  if (gallery.visibility === "password") return verifyGalleryToken(gallery, passwordCookieValue);
  return true;
}
