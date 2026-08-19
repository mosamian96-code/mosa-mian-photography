import { NextRequest, NextResponse } from "next/server";
import { presignUploadPartUrl } from "@/lib/storage";
import { requireAdminSession } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  const { storageKey, uploadId, partNumber } = (await req.json()) as {
    storageKey?: string;
    uploadId?: string;
    partNumber?: number;
  };
  if (!storageKey || !uploadId || !partNumber) {
    return NextResponse.json({ error: "storageKey, uploadId, partNumber required" }, { status: 400 });
  }

  const url = await presignUploadPartUrl(storageKey, uploadId, partNumber);
  return NextResponse.json({ url });
}
