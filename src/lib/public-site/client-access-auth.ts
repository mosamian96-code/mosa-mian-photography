import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { clientAccess } from "@/lib/db/schema";

function signClientAccessToken(clientAccessId: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET!).update(clientAccessId).digest("hex");
}

export function clientAccessSessionCookieName(clientAccessId: string) {
  return `mmp_client_${clientAccessId}`;
}

export function clientAccessSessionCookieValue(clientAccessId: string) {
  return signClientAccessToken(clientAccessId);
}

export function verifyClientAccessToken(clientAccessId: string, token: string | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(signClientAccessToken(clientAccessId));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

type ClientAccess = typeof clientAccess.$inferSelect;

/**
 * Re-validates a client_access row for every API call that acts on it (favorite,
 * comment, download) rather than trusting the id alone — the id reaches the browser
 * once the gallery page has already resolved it, but revocation/expiry/password state
 * can change between page load and any given click, and the id itself isn't a secret
 * the way the token is.
 */
export async function resolveLiveClientAccess(
  clientAccessId: string,
): Promise<{ ok: true; link: ClientAccess } | { ok: false; status: number; error: string }> {
  const link = await db.query.clientAccess.findFirst({ where: eq(clientAccess.id, clientAccessId) });
  if (!link) return { ok: false, status: 404, error: "not found" };
  if (link.revokedAt) return { ok: false, status: 403, error: "revoked" };
  if (link.expiresAt && link.expiresAt < new Date()) return { ok: false, status: 403, error: "expired" };

  if (link.passwordHash) {
    const cookieStore = await cookies();
    const cookieToken = cookieStore.get(clientAccessSessionCookieName(link.id))?.value;
    if (!verifyClientAccessToken(link.id, cookieToken)) {
      return { ok: false, status: 401, error: "locked" };
    }
  }

  return { ok: true, link };
}
