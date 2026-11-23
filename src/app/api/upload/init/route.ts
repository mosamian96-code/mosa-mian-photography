import { NextRequest, NextResponse } from "next/server";
import { extOf, classifyKind } from "@/lib/ingest/classify";
import { createMultipartUpload, originalKey, presignPutUrl } from "@/lib/storage";
import { requireAdminSession } from "@/lib/require-admin";
import { BodyError, requiredString, withJsonBody } from "@/lib/request-body";
import { isOriginalKey, isSha256 } from "@/lib/upload-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Brief section 6: "S3 multipart above 50 MB, 16 MB parts, 4 in parallel."
const MULTIPART_THRESHOLD = 50 * 1024 * 1024;
const PART_SIZE = 16 * 1024 * 1024;
// Videos limited to 1 GB
const MAX_VIDEO_SIZE = 1 * 1024 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { response } = await requireAdminSession();
  if (response) return response;

  return withJsonBody(req, async (body) => {
    // The hash becomes part of the storage key, so it must be exactly a hash: anything
    // else could put the upload somewhere other than originals/.
    const sha256 = requiredString(body, "sha256", { max: 64 }).toLowerCase();
    if (!isSha256(sha256)) return NextResponse.json({ error: "sha256 must be 64 hex characters" }, { status: 400 });
    const filename = requiredString(body, "filename", { max: 500 });
    const mime = requiredString(body, "mime", { max: 200 });
    const size = body.size;
    if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) throw new BodyError("size must be a positive whole number");

    const kind = classifyKind(filename);
    if (kind === "video" && size > MAX_VIDEO_SIZE) {
      return NextResponse.json({ error: `video files must be under 1 GB (${size} bytes)` }, { status: 400 });
    }

    // Bucketed by import time, not EXIF capture date — capture date isn't known until
    // the ingest worker runs exiftool. The path is a lifecycle/browsing convenience,
    // not the lookup key (that's the sha256 in the filename itself and in the DB).
    const storageKey = originalKey(sha256, extOf(filename));
    if (!isOriginalKey(storageKey)) {
      return NextResponse.json({ error: "the file name needs a simple extension, like .jpg or .cr3" }, { status: 400 });
    }

    if (size <= MULTIPART_THRESHOLD) {
      const uploadUrl = await presignPutUrl(storageKey, mime);
      return NextResponse.json({ mode: "single", storageKey, uploadUrl });
    }

    const uploadId = await createMultipartUpload(storageKey, mime);
    const totalParts = Math.ceil(size / PART_SIZE);
    return NextResponse.json({ mode: "multipart", storageKey, uploadId, partSize: PART_SIZE, totalParts });
  });
}
