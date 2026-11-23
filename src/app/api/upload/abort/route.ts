import { NextRequest, NextResponse } from "next/server";
import { abortMultipartUpload } from "@/lib/storage";
import { requireAdminSession } from "@/lib/require-admin";
import { requiredString, withJsonBody } from "@/lib/request-body";
import { isOriginalKey } from "@/lib/upload-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  return withJsonBody(req, async (body) => {
    const storageKey = requiredString(body, "storageKey", { max: 300 });
    const uploadId = requiredString(body, "uploadId", { max: 1000 });
    if (!isOriginalKey(storageKey)) return NextResponse.json({ error: "not an upload key" }, { status: 400 });

    await abortMultipartUpload(storageKey, uploadId);
    return NextResponse.json({ ok: true });
  });
}
