/**
 * Prepares an empty test environment for the browser tests: the storage bucket (with
 * the same CORS rules scripts/setup-b2-cors.ts gives production), the admin account,
 * and a folder holding one published gallery with a client link. The tests then drive
 * the real UI for everything else -- upload, processing, viewing, downloading.
 *
 * Run via: npx tsx e2e/seed.ts   (needs the app's usual env: DATABASE_URL, B2_*, ...)
 */
import { CreateBucketCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { db } from "../src/lib/db";
import { clientAccess, folders, galleries, users } from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/password";
import { B2_BUCKET, b2 } from "../src/lib/storage";
import { E2E } from "./constants";

async function main() {
  await b2.send(new CreateBucketCommand({ Bucket: B2_BUCKET })).catch((err: Error) => {
    if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists/.test(err.name)) throw err;
  });
  await b2.send(
    new PutBucketCorsCommand({
      Bucket: B2_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [process.env.AUTH_URL ?? "http://localhost:3000"],
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    }),
  );

  await db
    .insert(users)
    .values({ email: E2E.adminEmail, name: "E2E Admin", passwordHash: hashPassword(E2E.adminPassword) })
    .onConflictDoNothing();
  await db
    .insert(folders)
    .values({ id: E2E.folderId, slug: E2E.folderSlug, title: "E2E", visibility: "public" })
    .onConflictDoNothing();
  await db
    .insert(galleries)
    .values({
      id: E2E.galleryId,
      folderId: E2E.folderId,
      slug: E2E.gallerySlug,
      title: "E2E Gallery",
      visibility: "public",
      publishedAt: new Date(),
      downloadsPolicy: "original",
      publicDownloadsPolicy: "original",
    })
    .onConflictDoNothing();
  await db
    .insert(clientAccess)
    .values({ id: E2E.clientAccessId, galleryId: E2E.galleryId, token: E2E.clientToken, downloadsEnabled: true })
    .onConflictDoNothing();

  console.log("e2e seed complete");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
