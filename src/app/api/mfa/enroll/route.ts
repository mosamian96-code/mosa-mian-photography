import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { generateSecret, totpUri, verifyTotp } from "@/lib/mfa";

const PENDING_COOKIE = "mmp_pending_mfa_secret";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const secret = generateSecret();
  const qrDataUrl = await QRCode.toDataURL(totpUri(secret, session.user.email));

  const res = NextResponse.json({ qrDataUrl, secret });
  res.cookies.set(PENDING_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/mfa",
  });
  return res;
}

export async function POST(req: NextRequest) {
  // TEMP DEBUG — remove after diagnosing the enrollment failure.
  console.log("[mfa/enroll POST DEBUG] request received", {
    allCookieNames: req.cookies.getAll().map((c) => c.name),
    serverTime: new Date().toISOString(),
  });

  const session = await auth();

  console.log("[mfa/enroll POST DEBUG] session", {
    hasSession: Boolean(session),
    email: session?.user?.email,
    userId: session?.user?.id,
    mfaEnrolled: session?.mfaEnrolled,
    mfaVerified: session?.mfaVerified,
  });

  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pendingSecret = req.cookies.get(PENDING_COOKIE)?.value;
  const { code } = (await req.json()) as { code?: string };

  console.log("[mfa/enroll POST DEBUG] verifying", {
    hasPendingSecret: Boolean(pendingSecret),
    pendingSecretLen: pendingSecret?.length,
    codeReceived: code,
  });

  if (!pendingSecret || !code || !verifyTotp(pendingSecret, session.user.email, code)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  await db
    .update(users)
    .set({ mfaSecret: pendingSecret, mfaEnabledAt: new Date() })
    .where(eq(users.id, session.user.id));

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(PENDING_COOKIE);
  return res;
}
