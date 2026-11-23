import { NextRequest, NextResponse } from "next/server";
import { presignUploadPartUrl } from "@/lib/storage";
import { requireAdminSession } from "@/lib/require-admin";
import { optionalInteger, requiredString, withJsonBody } from "@/lib/request-body";
import { isOriginalKey } from "@/lib/upload-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  return withJsonBody(req, async (body) => {
    const storageKey = requiredString(body, "storageKey", { max: 300 });
    const uploadId = requiredString(body, "uploadId", { max: 1000 });
    // S3 allows part numbers 1 to 10,000.
    const partNumber = optionalInteger(body, "partNumber", 1, 10_000);
    if (!partNumber) return NextResponse.json({ error: "partNumber required" }, { status: 400 });
    if (!isOriginalKey(storageKey)) return NextResponse.json({ error: "not an upload key" }, { status: 400 });

    const url = await presignUploadPartUrl(storageKey, uploadId, partNumber);
    return NextResponse.json({ url });
  });
}
