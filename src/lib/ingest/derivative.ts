import sharp from "sharp";

export type DerivativeFormat = "avif" | "webp" | "jpeg";

export type GeneratedDerivative = {
  variant: string;
  format: DerivativeFormat;
  width: number;
  height: number;
  buffer: Buffer;
};

const SIZES = [400, 1200, 2560] as const;

async function renderOne(
  baseRaster: Buffer,
  width: number,
  format: DerivativeFormat,
): Promise<GeneratedDerivative> {
  // .rotate() with no args bakes the source's EXIF Orientation into the actual pixels
  // before anything else touches them. Order matters: it must run before .resize().
  // Without it, stripping EXIF (below) would silently discard the only record of which
  // way the camera was held, leaving portrait/rotated shots sideways forever.
  let pipeline = sharp(baseRaster).rotate().resize({ width, withoutEnlargement: true });
  // No .withMetadata() call anywhere in this file: sharp's default for a format
  // conversion is to drop all EXIF/IPTC/XMP from the output, which is exactly brief
  // section 5's "strip GPS and camera serial from every public derivative" — done by
  // omission, verified by the accompanying test rather than left implicit.
  if (format === "avif") pipeline = pipeline.avif({ quality: 55 });
  else if (format === "webp") pipeline = pipeline.webp({ quality: 70 });
  else pipeline = pipeline.jpeg({ quality: 90 });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { variant: String(width), format, width: info.width, height: info.height, buffer: data };
}

/** The full public derivative set for one base raster (brief section 5). */
export async function generatePublicDerivatives(baseRaster: Buffer): Promise<GeneratedDerivative[]> {
  const results: GeneratedDerivative[] = [];
  for (const size of SIZES) {
    results.push(await renderOne(baseRaster, size, "avif"));
    results.push(await renderOne(baseRaster, size, "webp"));
  }
  // JPEG at 2560 specifically for download-enabled galleries (section 5).
  results.push(await renderOne(baseRaster, 2560, "jpeg"));
  return results;
}

/** Tiny inline blur placeholder, stored as a data URI directly in the DB (section 5). */
export async function generateLqip(baseRaster: Buffer): Promise<string> {
  const tiny = await sharp(baseRaster)
    .rotate()
    .resize({ width: 24, withoutEnlargement: true })
    .jpeg({ quality: 40 })
    .toBuffer();
  return `data:image/jpeg;base64,${tiny.toString("base64")}`;
}
