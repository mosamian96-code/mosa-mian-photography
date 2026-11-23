import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientAccess } from "@/lib/db/schema";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { requiredString, withJsonBody } from "@/lib/request-body";
import { withErrorLogging } from "@/lib/with-error-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Optional email capture before viewing (brief section 9) — stored directly on the
// client_access row so the admin's client list picks it up without a separate table.
export const POST = withErrorLogging("public-client-access-email", async (req: NextRequest) =>
  withJsonBody(req, async (body) => {
    const limited = await rateLimit("client-email", requestIp(req), { limit: 20, windowSeconds: 60 * 60 });
    if (limited) return limited;

    const token = requiredString(body, "token", { max: 200 });
    const email = requiredString(body, "email", { max: 254 });
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "token and a valid email are required" }, { status: 400 });
    }

    const link = await db.query.clientAccess.findFirst({ where: eq(clientAccess.token, token) });
    const isExpired = Boolean(link?.expiresAt && link.expiresAt < new Date());
    if (!link || link.revokedAt || isExpired) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    if (!link.email) {
      await db.update(clientAccess).set({ email }).where(eq(clientAccess.id, link.id));
    }

    return NextResponse.json({ ok: true });
  }),
);
