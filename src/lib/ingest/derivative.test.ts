import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { exiftool } from "exiftool-vendored";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { generateLqip, generatePublicDerivatives } from "./derivative";

afterAll(() => exiftool.end());

const MARKER = "MOSA-MIAN-SECRET-MARKER";

async function makeSourceWithExif(): Promise<Buffer> {
  // sharp's withExif() only exposes the IFD0-3 buckets, not a distinct GPS bucket —
  // GPS tags live in their own IFD at the binary level regardless, and since this
  // function's guarantee is "no EXIF survives at all" (no .withMetadata() call
  // anywhere), one marker tag is enough to prove metadata isn't propagated.
  return sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .jpeg()
    .withExif({
      IFD0: { Copyright: MARKER, GPSLatitude: "40/1 26/1 46/1" },
    })
    .toBuffer();
}

describe("generatePublicDerivatives", () => {
  it("strips EXIF/GPS from every derivative (brief section 5)", async () => {
    const source = await makeSourceWithExif();
    // Sanity-check the fixture actually carries EXIF before asserting it's gone after.
    const sourceMeta = await sharp(source).metadata();
    expect(sourceMeta.exif).toBeDefined();

    const derivatives = await generatePublicDerivatives(source);
    expect(derivatives.length).toBeGreaterThan(0);

    for (const d of derivatives) {
      const meta = await sharp(d.buffer).metadata();
      expect(meta.exif, `${d.format}/${d.variant} should have no EXIF`).toBeUndefined();
      expect(d.buffer.toString("latin1")).not.toContain(MARKER);
    }
  });

  it("never upscales beyond the source width", async () => {
    const small = await sharp({
      create: { width: 100, height: 80, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const derivatives = await generatePublicDerivatives(small);
    for (const d of derivatives) {
      expect(d.width).toBeLessThanOrEqual(100);
    }
  });

  it("bakes EXIF orientation into pixels before stripping it, so rotated photos don't come out sideways", async () => {
    // sharp's own withExif() can't reliably round-trip a hand-set Orientation tag (it's
    // a binary SHORT, not the ASCII string pairs withExif is meant for) -- write it with
    // exiftool instead, the same tool the real ingest pipeline reads EXIF with.
    const tempDir = await mkdtemp(path.join(tmpdir(), "mmp-test-"));
    const tempPath = path.join(tempDir, "source.jpg");
    try {
      await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 50, b: 50 } },
      })
        .jpeg()
        .toFile(tempPath);
      // The `#` suffix tells exiftool to write the raw numeric code (6), not a
      // human string like "Rotate 90 CW".
      await exiftool.write(tempPath, { "Orientation#": 6 });
      const rotatedSource = await readFile(tempPath);

      const sourceMeta = await sharp(rotatedSource).metadata();
      expect(sourceMeta.orientation).toBe(6);

      // Orientation 6 = rotate 90deg CW to display correctly. A wide 800x600 source
      // shot this way should come out taller than it is wide once corrected.
      const derivatives = await generatePublicDerivatives(rotatedSource);
      for (const d of derivatives) {
        expect(
          d.height,
          `${d.format}/${d.variant} should be taller than wide once rotated`,
        ).toBeGreaterThan(d.width);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("generateLqip", () => {
  it("returns a small base64 JPEG data URI", async () => {
    const source = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();

    const lqip = await generateLqip(source);
    expect(lqip).toMatch(/^data:image\/jpeg;base64,/);
    expect(lqip.length).toBeLessThan(source.length);
  });
});
