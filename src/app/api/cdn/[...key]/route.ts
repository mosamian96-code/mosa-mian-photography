import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-log";
import { getObjectBuffer } from "@/lib/storage";

export const runtime = "nodejs";
// logError touches the DB client, which throws when DATABASE_URL is unset -- the
// exact case during the Docker build stage. Without this, build-time page-data
// collection crashes the same way it did for the password-reset routes earlier.
export const dynamic = "force-dynamic";

// Public derivatives, proxied rather than served from a public B2 bucket (brief
// section 5: "public via Cloudflare, immutable, 1 year cache"). B2 has no per-prefix
// ACL, only bucket-wide public/private, and originals must never be public -- so this
// route holds the B2 credentials server-side and Cloudflare caches its response at the
// edge instead. cdn.mosamianphotography.com points at this same app (see Caddyfile).
const ALLOWED_PREFIXES = ["derivatives/", "watermarked/"];

const CONTENT_TYPES: Record<string, string> = {
  avif: "image/avif",
  webp: "image/webp",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: keyParts } = await params;
  const key = keyParts.join("/");

  if (!ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await getObjectBuffer(key);
  } catch (err) {
    await logError("cdn", err instanceof Error ? err : new Error(`getObjectBuffer failed for ${key}: ${String(err)}`));
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
