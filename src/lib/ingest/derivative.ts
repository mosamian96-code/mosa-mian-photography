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
  // failOn defaults to "warning" -- libvips treats even fully-recoverable JPEG quirks
  // (e.g. "N extraneous bytes before marker", common from phone cameras and
  // WhatsApp re-encoding) as fatal otherwise, aborting the whole ingest job for an
  // image that actually decodes fine. "none" lets it decode as much as it can and
  // only fail on genuinely unreadable data.
  let pipeline = sharp(baseRaster, { failOn: "none" }).rotate().resize({ width, withoutEnlargement: true });
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

export type WatermarkPosition = "bottom_right" | "bottom_left" | "top_right" | "top_left" | "center" | "tile";

const GRAVITY_MAP: Record<Exclude<WatermarkPosition, "tile">, string> = {
  bottom_right: "southeast",
  bottom_left: "southwest",
  top_right: "northeast",
  top_left: "northwest",
  center: "center",
};

/** Scales a PNG's own alpha channel by `opacity` (0-1) — sharp's composite() has no
 * opacity option of its own, so this is done by hand before compositing. */
async function scaleAlpha(png: Buffer, opacity: number): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += info.channels) {
    data[i] = Math.round(data[i] * opacity);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
}

async function renderWatermarkedOne(
  baseRaster: Buffer,
  width: number,
  format: DerivativeFormat,
  preparedMark: Buffer,
  position: WatermarkPosition,
): Promise<GeneratedDerivative> {
  const resized = await sharp(baseRaster, { failOn: "none" }).rotate().resize({ width, withoutEnlargement: true }).toBuffer();
  const resizedWidth = (await sharp(resized).metadata()).width ?? width;
  const markForThisSize = await sharp(preparedMark).resize({ width: Math.round(resizedWidth * 0.2) }).toBuffer();

  let pipeline =
    position === "tile"
      ? sharp(resized).composite([{ input: markForThisSize, tile: true, blend: "over" }])
      : sharp(resized).composite([{ input: markForThisSize, gravity: GRAVITY_MAP[position] }]);

  if (format === "avif") pipeline = pipeline.avif({ quality: 55 });
  else if (format === "webp") pipeline = pipeline.webp({ quality: 70 });
  else pipeline = pipeline.jpeg({ quality: 90 });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { variant: String(width), format, width: info.width, height: info.height, buffer: data };
}

/**
 * Watermarked derivative set (brief section 9): a separate object per size/format
 * from the clean set, so toggling a gallery's watermark never requires reprocessing
 * from the original. Opacity is baked into the mark's alpha channel once (scaleAlpha),
 * then reused for every size — only the mark's own width is rescaled per derivative.
 */
export async function generateWatermarkedDerivatives(
  baseRaster: Buffer,
  watermarkPng: Buffer,
  position: WatermarkPosition,
  opacity: number,
): Promise<GeneratedDerivative[]> {
  const preparedMark = await scaleAlpha(watermarkPng, opacity);
  const results: GeneratedDerivative[] = [];
  for (const size of SIZES) {
    results.push(await renderWatermarkedOne(baseRaster, size, "avif", preparedMark, position));
    results.push(await renderWatermarkedOne(baseRaster, size, "webp", preparedMark, position));
  }
  results.push(await renderWatermarkedOne(baseRaster, 2560, "jpeg", preparedMark, position));
  return results;
}

/** Tiny inline blur placeholder, stored as a data URI directly in the DB (section 5). */
export async function generateLqip(baseRaster: Buffer): Promise<string> {
  const tiny = await sharp(baseRaster, { failOn: "none" })
    .rotate()
    .resize({ width: 24, withoutEnlargement: true })
    .jpeg({ quality: 40 })
    .toBuffer();
  return `data:image/jpeg;base64,${tiny.toString("base64")}`;
}

/**
 * Applies a numeric EXIF orientation code directly, for buffers that carry no
 * orientation tag of their own. This is specifically for RAW-embedded preview JPEGs:
 * the orientation lives on the RAW container's EXIF, not on the extracted preview, so
 * plain .rotate() (which only reads whatever tag is on the buffer it's given) silently
 * no-ops on them. Standard 8-value EXIF orientation table; cameras only ever produce
 * 1, 3, 6, or 8 in practice (2/4/5/7 are mirrored variants from scanners/software).
 */
export function normalizeOrientation(buffer: Buffer, orientation: number | undefined): Promise<Buffer> {
  if (!orientation || orientation === 1) return Promise.resolve(buffer);
  let pipeline = sharp(buffer, { failOn: "none" });
  switch (orientation) {
    case 2:
      pipeline = pipeline.flop();
      break;
    case 3:
      pipeline = pipeline.rotate(180);
      break;
    case 4:
      pipeline = pipeline.flip();
      break;
    case 5:
      pipeline = pipeline.rotate(90).flip();
      break;
    case 6:
      pipeline = pipeline.rotate(90);
      break;
    case 7:
      pipeline = pipeline.rotate(270).flip();
      break;
    case 8:
      pipeline = pipeline.rotate(270);
      break;
  }
  return pipeline.jpeg().toBuffer();
}
