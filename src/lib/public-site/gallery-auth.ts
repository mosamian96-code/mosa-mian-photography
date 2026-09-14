import { createHmac, timingSafeEqual } from "node:crypto";

function signGalleryToken(galleryId: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET!).update(galleryId).digest("hex");
}

export function gallerySessionCookieName(galleryId: string) {
  return `mmp_gallery_${galleryId}`;
}

export function gallerySessionCookieValue(galleryId: string) {
  return signGalleryToken(galleryId);
}

export function verifyGalleryToken(galleryId: string, token: string | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(signGalleryToken(galleryId));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Same authorization a visitor needs to view the gallery page itself (see
 * [...path]/page.tsx) -- "private" means client-link-only and is never satisfied
 * this way, "password" needs the same signed cookie the password form sets, and
 * public/unlisted need nothing beyond knowing the URL. Reused by the public
 * gallery-download and gallery-download-zip routes so "can download" never exceeds
 * "can view". */
export function publicVisitorCanViewGallery(
  visibility: "public" | "unlisted" | "password" | "private",
  galleryId: string,
  passwordCookieValue: string | undefined,
): boolean {
  if (visibility === "private") return false;
  if (visibility === "password") return verifyGalleryToken(galleryId, passwordCookieValue);
  return true;
}
