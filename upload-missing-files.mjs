import { readFile } from "node:fs/promises";
import path from "node:path";

const MANIFEST_PATH = "E:\\smugmug-export\\manifest.json";
const MISSING_FILES_PATH = "C:\\Users\\musan\\mosa-mian-photography\\scratch-missing-files.ndjson";

async function main() {
  console.log("Loading manifest...");
  const manifestRaw = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(manifestRaw);

  // Build sha256 -> gallery map
  const sha256ToGallery = new Map();
  for (const album of manifest.albums) {
    const galleryName = album.name;
    for (const image of album.images) {
      sha256ToGallery.set(image.sha256, galleryName);
    }
  }

  console.log(`Loaded ${sha256ToGallery.size} images from manifest`);

  // Read missing files
  const missingRaw = await readFile(MISSING_FILES_PATH, "utf8");
  const missingFiles = missingRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  console.log(`Found ${missingFiles.length} missing files`);

  // Group by gallery
  const byGallery = new Map();
  let unmapped = 0;

  for (const file of missingFiles) {
    const gallery = sha256ToGallery.get(file.sha256);
    if (!gallery) {
      unmapped++;
      continue;
    }
    if (!byGallery.has(gallery)) byGallery.set(gallery, []);
    byGallery.get(gallery).push(file);
  }

  console.log(`\nMissing files by gallery:`);
  for (const [gallery, files] of byGallery) {
    console.log(`  ${gallery}: ${files.length} files`);
  }
  if (unmapped > 0) {
    console.log(`  (unmapped): ${unmapped} files`);
  }

  console.log(`\nReady to upload. Total: ${missingFiles.length - unmapped} files to ${byGallery.size} galleries`);
}

main().catch(console.error);
