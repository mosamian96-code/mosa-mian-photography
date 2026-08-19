/**
 * One-off setup script, not part of the app's runtime. Browser uploads (section 6)
 * PUT directly to B2 from mosamianphotography.com — a different origin than the
 * bucket's own endpoint — so the bucket needs CORS rules, and the multipart upload
 * flow specifically needs ETag exposed (S3's CompleteMultipartUpload call requires
 * each part's ETag, which the browser can only read from the PUT response if the
 * bucket's CORS config exposes that header cross-origin).
 *
 * Run once via: docker compose run --rm migrate npx tsx scripts/setup-b2-cors.ts
 */
import { PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { b2, B2_BUCKET } from "../src/lib/storage";

const origin = process.env.AUTH_URL;
if (!origin) throw new Error("AUTH_URL must be set (used as the allowed CORS origin)");

async function main() {
  await b2.send(
    new PutBucketCorsCommand({
      Bucket: B2_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [origin!],
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    }),
  );
  console.log(`B2 CORS configured for origin ${origin} on bucket ${B2_BUCKET}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
