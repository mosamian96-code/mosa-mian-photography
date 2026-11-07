import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lets the client-side error.tsx/global-error.tsx boundaries get a crash into the
 * same error_log table server-side code writes to -- without this, a React render
 * error on the client would only ever show up in the visitor's own browser console,
 * invisible to anyone actually running the site. Body is attacker-controlled (any
 * visitor can POST here), so only ever logged, never trusted or reflected back. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.slice(0, 2000) : "unknown client error";
  await logError("client-error-boundary", new Error(message));
  return NextResponse.json({ ok: true });
}
