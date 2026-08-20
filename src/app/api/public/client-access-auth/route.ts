import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientAccess } from "@/lib/db/schema";
import { clientAccessSessionCookieName, clientAccessSessionCookieValue } from "@/lib/public-site/client-access-auth";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { token, password } = (await req.json()) as { token?: string; password?: string };
  if (!token || !password) {
    return NextResponse.json({ error: "token and password required" }, { status: 400 });
  }

  const link = await db.query.clientAccess.findFirst({ where: eq(clientAccess.token, token) });
  const isExpired = Boolean(link?.expiresAt && link.expiresAt < new Date());
  if (!link || link.revokedAt || isExpired || !link.passwordHash || !verifyPassword(password, link.passwordHash)) {
    return NextResponse.json({ error: "incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(clientAccessSessionCookieName(link.id), clientAccessSessionCookieValue(link.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
