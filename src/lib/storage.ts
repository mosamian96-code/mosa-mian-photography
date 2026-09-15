import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";

// B2 speaks the S3 API, so the generic S3 client works unmodified — this is the whole
// reason presigned multipart upload (section 6) works without a custom B2 SDK.
//
// requestHandler timeouts are deliberate, not defaults: the AWS SDK v3's Node HTTP
// handler has no timeout at all unless one is configured, so a connection that hangs
// (a dead socket, a stalled tunnel) blocks forever with nothing to trigger the SDK's
// own retry logic -- the exact bug already found and fixed once tonight in the
// SmugMug export client (undiagnosed "stalls" that were really unbounded fetch()
// calls). 10s to establish a connection, 120s per request is generous enough for a
// large original on a slow link without being effectively unbounded.
//
// keepAlive: false is also deliberate, not an oversight -- this client lives for the
// lifetime of the app process (hours/days), and the default keep-alive agent pools
// sockets that B2 (or something between the VPS and it) can close server-side while
// idle without telling Node. The next request to reuse that socket fails with a
// connection error that looked, in production, like "photo thumbnails and downloads
// intermittently 404 after the app's been up for a while, works again right after a
// restart" -- a fresh connection per request costs a bit of latency but removes the
// whole bug class. maxAttempts adds a retry safety net for any other transient
// network blip on top of that.
export const b2 = new S3Client({
  region: "auto",
  endpoint: process.env.B2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APPLICATION_KEY!,
  },
  forcePathStyle: true,
  maxAttempts: 5,
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 10_000,
    requestTimeout: 120_000,
    httpsAgent: { keepAlive: false },
    httpAgent: { keepAlive: false },
  }),
});

export const B2_BUCKET = process.env.B2_BUCKET!;

export function presignPutUrl(key: string, contentType: string, expiresInSeconds = 300) {
  const command = new PutObjectCommand({
    Bucket: B2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(b2, command, { expiresIn: expiresInSeconds });
}

export function presignGetUrl(key: string, expiresInSeconds = 300) {
  const command = new GetObjectCommand({ Bucket: B2_BUCKET, Key: key });
  return getSignedUrl(b2, command, { expiresIn: expiresInSeconds });
}

/** Same as presignGetUrl, but forces a browser "Save As" with the given filename
 * instead of an inline view — for client-gallery downloads (brief section 9). */
export function presignDownloadUrl(key: string, filename: string, expiresInSeconds = 300) {
  const command = new GetObjectCommand({
    Bucket: B2_BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
  });
  return getSignedUrl(b2, command, { expiresIn: expiresInSeconds });
}

export async function putObject(key: string, body: Buffer | string, contentType: string) {
  await b2.send(
    new PutObjectCommand({ Bucket: B2_BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getObjectText(key: string) {
  const result = await b2.send(new GetObjectCommand({ Bucket: B2_BUCKET, Key: key }));
  return result.Body?.transformToString();
}

/** Raw readable stream for one object -- used for zip-download endpoints, which
 * append each original straight into the archive instead of buffering full files in
 * memory (a gallery can run into the hundreds of originals at 10-20MB each). The SDK
 * types this as a union across environments, but running under the Node runtime
 * (declared in every route that calls this) it's always a real Node Readable. */
export async function getObjectStream(key: string): Promise<Readable> {
  const result = await b2.send(new GetObjectCommand({ Bucket: B2_BUCKET, Key: key }));
  if (!result.Body) throw new Error(`no body for ${key}`);
  return result.Body as Readable;
}

export async function deleteObject(key: string) {
  await b2.send(new DeleteObjectCommand({ Bucket: B2_BUCKET, Key: key }));
}

/** Server-side copy (no download/re-upload) -- used to rekey a bulk-imported object
 * from wherever rclone dropped it to the canonical sha256-addressed path. */
export async function copyObject(fromKey: string, toKey: string) {
  await b2.send(
    new CopyObjectCommand({ Bucket: B2_BUCKET, CopySource: `${B2_BUCKET}/${fromKey}`, Key: toKey }),
  );
}

export async function getObjectBuffer(key: string) {
  const result = await b2.send(new GetObjectCommand({ Bucket: B2_BUCKET, Key: key }));
  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) throw new Error(`empty body for ${key}`);
  return Buffer.from(bytes);
}

/** Lists every object key under a prefix, paginating transparently (section 6's
 * "scan bucket" job needs every originals/ key, which a single ListObjectsV2 call
 * won't return once the library is larger than 1000 objects). */
export async function listObjectKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const result = await b2.send(
      new ListObjectsV2Command({ Bucket: B2_BUCKET, Prefix: prefix, ContinuationToken: continuationToken }),
    );
    for (const obj of result.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = result.NextContinuationToken;
  } while (continuationToken);
  return keys;
}

export async function headObject(key: string) {
  try {
    const result = await b2.send(new HeadObjectCommand({ Bucket: B2_BUCKET, Key: key }));
    return { exists: true as const, size: result.ContentLength ?? 0 };
  } catch (err) {
    if (err instanceof Error && err.name === "NotFound") return { exists: false as const };
    throw err;
  }
}

// --- Multipart upload (section 6: "S3 multipart above 50 MB, 16 MB parts, 4 in parallel") ---

export async function createMultipartUpload(key: string, contentType: string) {
  const result = await b2.send(
    new CreateMultipartUploadCommand({ Bucket: B2_BUCKET, Key: key, ContentType: contentType }),
  );
  if (!result.UploadId) throw new Error("B2 did not return an UploadId");
  return result.UploadId;
}

export function presignUploadPartUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresInSeconds = 900,
) {
  const command = new UploadPartCommand({
    Bucket: B2_BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(b2, command, { expiresIn: expiresInSeconds });
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
) {
  await b2.send(
    new CompleteMultipartUploadCommand({
      Bucket: B2_BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

export async function abortMultipartUpload(key: string, uploadId: string) {
  await b2.send(new AbortMultipartUploadCommand({ Bucket: B2_BUCKET, Key: key, UploadId: uploadId }));
}

// --- Storage key layout (brief section 5, fixed) ---

export function originalKey(sha256: string, ext: string, capturedAt: Date = new Date()) {
  const yyyy = capturedAt.getUTCFullYear();
  const mm = String(capturedAt.getUTCMonth() + 1).padStart(2, "0");
  return `originals/${yyyy}/${mm}/${sha256}.${ext.replace(/^\./, "").toLowerCase()}`;
}

export function derivativeKey(sha256: string, variant: string, format: string) {
  return `derivatives/${sha256}/${variant}.${format}`;
}

export function watermarkedKey(sha256: string, variant: string, format: string) {
  return `watermarked/${sha256}/${variant}.${format}`;
}

/** Storage key for an admin-uploaded watermark mark image itself (not a derivative). */
export function watermarkMarkKey(watermarkId: string) {
  return `watermarks/${watermarkId}.png`;
}

/** Public URL for a derivative, proxied through /api/cdn (see that route for why). */
export function publicDerivativeUrl(key: string) {
  const base = process.env.CDN_BASE_URL;
  return base ? `${base}/${key}` : `/api/cdn/${key}`;
}
