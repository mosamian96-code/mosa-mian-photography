import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// B2 speaks the S3 API, so the generic S3 client works unmodified — this is the whole
// reason presigned multipart upload (section 6) works without a custom B2 SDK.
export const b2 = new S3Client({
  region: "auto",
  endpoint: process.env.B2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APPLICATION_KEY!,
  },
  forcePathStyle: true,
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

export async function putObject(key: string, body: Buffer | string, contentType: string) {
  await b2.send(
    new PutObjectCommand({ Bucket: B2_BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getObjectText(key: string) {
  const result = await b2.send(new GetObjectCommand({ Bucket: B2_BUCKET, Key: key }));
  return result.Body?.transformToString();
}

export async function deleteObject(key: string) {
  await b2.send(new DeleteObjectCommand({ Bucket: B2_BUCKET, Key: key }));
}
