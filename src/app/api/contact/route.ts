import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { contactSubmissions } from "@/lib/db/schema";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { name, email, message, turnstileToken } = (await req.json()) as {
    name?: string;
    email?: string;
    message?: string;
    turnstileToken?: string;
  };
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "name, email, and message are required" }, { status: 400 });
  }
  if (!turnstileToken) {
    return NextResponse.json({ error: "verification required" }, { status: 400 });
  }

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for");
  const verified = await verifyTurnstile(turnstileToken, ip);
  if (!verified) return NextResponse.json({ error: "verification failed" }, { status: 400 });

  await db.insert(contactSubmissions).values({
    name: name.trim(),
    email: email.trim(),
    message: message.trim().slice(0, 5000),
  });

  if (process.env.RESEND_API_KEY && process.env.CONTACT_TO_EMAIL) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      // Sandbox sender until a real domain is verified in Resend (see docs/deploy.md /
      // src/lib/auth/config.ts, which has the same constraint for magic links).
      from: "Mosa Mian Photography <onboarding@resend.dev>",
      to: process.env.CONTACT_TO_EMAIL,
      replyTo: email.trim(),
      subject: `New contact form message from ${name.trim()}`,
      text: message.trim(),
    });
  }

  return NextResponse.json({ ok: true });
}
