import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactSubmissions } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/email-templates";
import { logError } from "@/lib/error-log";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { requiredString, withJsonBody } from "@/lib/request-body";
import { verifyTurnstile } from "@/lib/turnstile";
import { withErrorLogging } from "@/lib/with-error-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST = withErrorLogging("contact", async (req: NextRequest) =>
  withJsonBody(req, async (body) => {
    const ip = requestIp(req);
    const limited = await rateLimit("contact", ip, { limit: 5, windowSeconds: 60 * 60 });
    if (limited) return limited;

    const name = requiredString(body, "name", { max: 200 });
    const email = requiredString(body, "email", { max: 254 });
    const message = requiredString(body, "message", { max: 5000 });
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "please enter a valid email address" }, { status: 400 });
    }
    const turnstileToken = requiredString(body, "turnstileToken", { max: 4096 });

    const verified = await verifyTurnstile(turnstileToken, ip);
    if (!verified) return NextResponse.json({ error: "verification failed" }, { status: 400 });

    await db.insert(contactSubmissions).values({ name, email, message });

    // The message is already saved, so a failed notification is logged rather than
    // shown to the visitor (who would otherwise send it again). This used to call
    // Resend directly, where a refused send comes back as a value, not an exception
    // -- so a failure was never noticed. sendEmail throws with Resend's reason and
    // uses EMAIL_FROM once it's set.
    const to = process.env.CONTACT_TO_EMAIL?.trim();
    if (process.env.RESEND_API_KEY && to) {
      try {
        await sendEmail({
          to,
          replyTo: email,
          subject: `New contact form message from ${name.replace(/[\r\n]+/g, " ")}`,
          text: message,
          html: contactNotificationHtml(name, email, message),
        });
      } catch (err) {
        await logError("contact-notification", err);
      }
    }

    return NextResponse.json({ ok: true });
  }),
);

function contactNotificationHtml(name: string, email: string, message: string) {
  return `<p><strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt; wrote:</p><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`;
}
