import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientAccess } from "@/lib/db/schema";
import { clientAccessSessionCookieName, clientAccessSessionCookieValue } from "@/lib/public-site/client-access-auth";
import { verifyPassword } from "@/lib/password";
import { PASSWORD_ATTEMPTS, failedAttempts, requestIp, tooManyRequests } from "@/lib/rate-limit";
import { requiredString, withJsonBody } from "@/lib/request-body";
import { withErrorLogging } from "@/lib/with-error-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withErrorLogging("public-client-access-auth", async (req: NextRequest) =>
  withJsonBody(req, async (body) => {
    const token = requiredString(body, "token", { max: 200 });
    const password = requiredString(body, "password", { max: 200, trim: false });

    const attemptKey = `${requestIp(req)}:${token}`;
    const blocked = await failedAttempts.blockedFor("client-link-password", attemptKey, PASSWORD_ATTEMPTS);
    if (blocked) return tooManyRequests(blocked);

    const link = await db.query.clientAccess.findFirst({ where: eq(clientAccess.token, token) });
    const isExpired = Boolean(link?.expiresAt && link.expiresAt < new Date());
    if (!link || link.revokedAt || isExpired || !link.passwordHash || !(await verifyPassword(password, link.passwordHash))) {
      await failedAttempts.record("client-link-password", attemptKey, PASSWORD_ATTEMPTS);
      return NextResponse.json({ error: "incorrect password" }, { status: 401 });
    }
    await failedAttempts.clear("client-link-password", attemptKey);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(clientAccessSessionCookieName(link.id), clientAccessSessionCookieValue(link.id, link.passwordHash), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return res;
  }),
);
