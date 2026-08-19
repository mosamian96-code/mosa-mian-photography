/**
 * One-off diagnostic: inspects EXIF Orientation on both the original RAW and its
 * embedded preview, to determine whether the preview carries its own (possibly
 * different) orientation tag from the RAW container's tag.
 * Run via: docker compose run --rm migrate npx tsx scripts/diagnose-orientation.ts <storageKey>
 */
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { exiftool } from "exiftool-vendored";
import { getObjectBuffer } from "../src/lib/storage";

async function main() {
  const storageKey = process.argv[2];
  if (!storageKey) throw new Error("usage: diagnose-orientation.ts <storageKey>");

  const tempDir = await mkdtemp(path.join(tmpdir(), "mmp-diag-"));
  const rawPath = path.join(tempDir, "original.cr3");
  const previewPath = path.join(tempDir, "preview.jpg");

  try {
    const buffer = await getObjectBuffer(storageKey);
    await writeFile(rawPath, buffer);

    const rawTags = await exiftool.read(rawPath);
    console.log("RAW file Orientation:", rawTags.Orientation);

    const previewBuffer = await exiftool.extractBinaryTagToBuffer("JpgFromRaw", rawPath);
    await writeFile(previewPath, previewBuffer);
    const previewTags = await exiftool.read(previewPath);
    console.log("Embedded preview Orientation:", previewTags.Orientation);
    console.log("Embedded preview dimensions:", previewTags.ImageWidth, "x", previewTags.ImageHeight);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await exiftool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
