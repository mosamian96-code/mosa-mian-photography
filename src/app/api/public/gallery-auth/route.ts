import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { galleries } from "@/lib/db/schema";
import { gallerySessionCookieName, gallerySessionCookieValue } from "@/lib/public-site/gallery-auth";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A password gate is a speed bump, not protection (brief section 9) — this is
// deliberately simple: one shared password per gallery, checked here, unlocked with a
// signed cookie rather than a real per-client session.
export async function POST(req: NextRequest) {
  const { galleryId, password } = (await req.json()) as { galleryId?: string; password?: string };
  if (!galleryId || !password) {
    return NextResponse.json({ error: "galleryId and password required" }, { status: 400 });
  }

  const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, galleryId) });
  if (!gallery?.passwordHash || !verifyPassword(password, gallery.passwordHash)) {
    return NextResponse.json({ error: "incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(gallerySessionCookieName(galleryId), gallerySessionCookieValue(galleryId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
