import { NextRequest, NextResponse } from "next/server";
import { getObjectBuffer } from "@/lib/storage";

export const runtime = "nodejs";

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
  } catch {
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
