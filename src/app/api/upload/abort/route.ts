import { NextRequest, NextResponse } from "next/server";
import { abortMultipartUpload } from "@/lib/storage";
import { requireAdminSession } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { storageKey, uploadId } = (await req.json()) as { storageKey?: string; uploadId?: string };
  if (!storageKey || !uploadId) {
    return NextResponse.json({ error: "storageKey, uploadId required" }, { status: 400 });
  }

  await abortMultipartUpload(storageKey, uploadId);
  return NextResponse.json({ ok: true });
}
