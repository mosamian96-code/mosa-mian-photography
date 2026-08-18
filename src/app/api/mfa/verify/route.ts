import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyTotp } from "@/lib/mfa";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { code } = (await req.json()) as { code?: string };
  const dbUser = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });

  if (!dbUser?.mfaSecret || !code || !verifyTotp(dbUser.mfaSecret, session.user.email, code)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
