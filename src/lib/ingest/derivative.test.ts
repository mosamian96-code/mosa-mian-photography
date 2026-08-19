import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { generateLqip, generatePublicDerivatives } from "./derivative";

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
