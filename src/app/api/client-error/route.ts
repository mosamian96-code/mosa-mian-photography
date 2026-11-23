import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-log";
import { rateLimit, requestIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same flood protection as /api/csp-report: anyone can POST here, so the same
// message is logged at most once an hour per process, and each visitor is capped.
const REPEAT_WINDOW_MS = 60 * 60 * 1000;
const MAX_TRACKED = 500;
const lastLogged = new Map<string, number>();

/** Lets the client-side error.tsx/global-error.tsx boundaries get a crash into the
 * same error_log table server-side code writes to -- without this, a React render
 * error on the client would only ever show up in the visitor's own browser console,
 * invisible to anyone actually running the site. Body is attacker-controlled (any
 * visitor can POST here), so only ever logged, never trusted or reflected back. */
export async function POST(req: NextRequest) {
  const limited = await rateLimit("client-error", requestIp(req), { limit: 20, windowSeconds: 60 * 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.slice(0, 2000) : "unknown client error";

  const now = Date.now();
  if ((lastLogged.get(message) ?? 0) > now - REPEAT_WINDOW_MS) return NextResponse.json({ ok: true });
  if (lastLogged.size >= MAX_TRACKED) lastLogged.clear();
  lastLogged.set(message, now);

  await logError("client-error-boundary", new Error(message));
  return NextResponse.json({ ok: true });
}
