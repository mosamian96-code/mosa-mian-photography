import { NextRequest } from "next/server";
import { logError } from "@/lib/error-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Browsers send these without credentials, so the endpoint is public: bodies are
// capped, extension noise is dropped, and a repeated violation is logged at most once
// an hour per process -- nobody can flood the error log through it.
const MAX_BODY_BYTES = 16_384;
const REPEAT_WINDOW_MS = 60 * 60 * 1000;
const MAX_TRACKED = 500;
const lastLogged = new Map<string, number>();

type ReportBody = Record<string, unknown>;

/** Untrusted input: strings only, query strings dropped (a blocked presigned upload
 * URL carries its signature there), and bounded in length. */
function clean(value: unknown) {
  return typeof value === "string" ? value.split("?")[0].slice(0, 300) : "";
}

/** Handles both report formats: report-uri's `{"csp-report": {...}}` with dashed keys,
 * and the Reporting API's `[{type: "csp-violation", body: {...}}]` with camelCase. */
function violations(payload: unknown): ReportBody[] {
  if (Array.isArray(payload)) {
    return payload
      .filter((r): r is { type: string; body: ReportBody } => r?.type === "csp-violation" && typeof r.body === "object")
      .map((r) => r.body);
  }
  const legacy = (payload as { "csp-report"?: unknown } | null)?.["csp-report"];
  return legacy && typeof legacy === "object" ? [legacy as ReportBody] : [];
}

export async function POST(req: NextRequest) {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }

  for (const body of violations(payload)) {
    const directive = clean(body["effective-directive"] ?? body.effectiveDirective ?? body["violated-directive"]);
    const blocked = clean(body["blocked-uri"] ?? body.blockedURL) || "inline";
    const page = clean(body["document-uri"] ?? body.documentURL);
    const source = clean(body["source-file"] ?? body.sourceFile);
    if (!directive) continue;
    // Browser extensions inject their own scripts and styles; those violations aren't ours.
    if ([blocked, source].some((url) => /^(chrome|moz|safari|safari-web|ms-browser)-extension:/.test(url))) continue;

    const key = `${directive} ${blocked}`;
    const now = Date.now();
    if ((lastLogged.get(key) ?? 0) > now - REPEAT_WINDOW_MS) continue;
    if (lastLogged.size >= MAX_TRACKED) lastLogged.clear();
    lastLogged.set(key, now);

    await logError(
      "csp-violation",
      new Error(`${directive} blocked ${blocked} on ${page || "unknown page"}${source ? ` (from ${source})` : ""}`),
    );
  }

  return new Response(null, { status: 204 });
}
