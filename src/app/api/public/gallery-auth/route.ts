import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { galleries } from "@/lib/db/schema";
import { gallerySessionCookieName, gallerySessionCookieValue } from "@/lib/public-site/gallery-auth";
import { verifyPassword } from "@/lib/password";
import { PASSWORD_ATTEMPTS, failedAttempts, requestIp, tooManyRequests } from "@/lib/rate-limit";
import { requiredString, withJsonBody } from "@/lib/request-body";
import { withErrorLogging } from "@/lib/with-error-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A password gate is a speed bump, not protection (brief section 9) — this is
// deliberately simple: one shared password per gallery, checked here, unlocked with a
// signed cookie rather than a real per-client session. Wrong guesses are limited per
// visitor and gallery (see PASSWORD_ATTEMPTS).
export const POST = withErrorLogging("public-gallery-auth", async (req: NextRequest) =>
  withJsonBody(req, async (body) => {
    const galleryId = requiredString(body, "galleryId", { max: 100 });
    const password = requiredString(body, "password", { max: 200, trim: false });

    const attemptKey = `${requestIp(req)}:${galleryId}`;
    const blocked = await failedAttempts.blockedFor("gallery-password", attemptKey, PASSWORD_ATTEMPTS);
    if (blocked) return tooManyRequests(blocked);

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, galleryId) });
    if (!gallery?.passwordHash || !(await verifyPassword(password, gallery.passwordHash))) {
      await failedAttempts.record("gallery-password", attemptKey, PASSWORD_ATTEMPTS);
      return NextResponse.json({ error: "incorrect password" }, { status: 401 });
    }
    await failedAttempts.clear("gallery-password", attemptKey);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(gallerySessionCookieName(gallery.id), gallerySessionCookieValue(gallery.id, gallery.passwordHash), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return res;
  }),
);
