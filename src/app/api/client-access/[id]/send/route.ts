import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { sendGalleryReadyEmail } from "@/lib/client-link-email";
import { db } from "@/lib/db";
import { clientAccess, galleries } from "@/lib/db/schema";
import { EmailError } from "@/lib/email";
import { requireAdminSession } from "@/lib/require-admin";
import { withErrorLogging } from "@/lib/with-error-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2000;
// Deliberately loose (one @, a dot in the domain, no spaces) -- Resend does the real
// validation; this only catches typos before a round trip.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails the client their gallery link ("your photos are ready"). */
export const POST = withErrorLogging("client-access-send", async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { response } = await requireAdminSession();
  if (response) return response;
  const { id } = await ctx.params;

  const json: unknown = await req.json().catch(() => null);
  const { to, message } = (json ?? {}) as Record<string, unknown>;
  const recipient = typeof to === "string" ? to.trim() : "";
  if (!EMAIL_PATTERN.test(recipient) || recipient.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (message !== undefined && message !== null && typeof message !== "string") {
    return NextResponse.json({ error: "message must be text" }, { status: 400 });
  }
  if (typeof message === "string" && message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `Keep the message under ${MAX_MESSAGE_LENGTH} characters.` }, { status: 400 });
  }

  const link = await db.query.clientAccess.findFirst({ where: eq(clientAccess.id, id) });
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (link.revokedAt) return NextResponse.json({ error: "This link is revoked." }, { status: 409 });
  if (link.expiresAt && link.expiresAt < new Date()) {
    return NextResponse.json({ error: "This link has expired. Set a later expiry date first." }, { status: 409 });
  }
  const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, link.galleryId) });
  if (!gallery) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const updated = await sendGalleryReadyEmail(link, gallery, recipient, typeof message === "string" ? message : null);
    return NextResponse.json({ sentAt: updated?.sentAt, sentTo: updated?.sentTo });
  } catch (err) {
    if (!(err instanceof EmailError)) throw err;
    // Resend's own reason, e.g. an unverified sending domain -- the studio shows it.
    return NextResponse.json({ error: `The email couldn't be sent: ${err.message}` }, { status: 502 });
  }
});
