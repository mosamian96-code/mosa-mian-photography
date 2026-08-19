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
