// Section 6's accepted upload list plus CR2 (older Canon RAW, ubiquitous enough that
// leaving it out would be a real gap even though the brief's list doesn't name it).
const RAW_EXTENSIONS = new Set(["dng", "cr3", "cr2", "arw", "nef", "raf", "orf", "rw2"]);
const HEIC_EXTENSIONS = new Set(["heic", "heif"]);
const JPEG_EXTENSIONS = new Set(["jpg", "jpeg"]);
const SIDECAR_EXTENSIONS = new Set(["xmp"]);

export type AssetKind = "raw" | "jpeg" | "heic" | "sidecar";

export function extOf(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export function classifyKind(filename: string): AssetKind | null {
  const ext = extOf(filename);
  if (RAW_EXTENSIONS.has(ext)) return "raw";
  if (JPEG_EXTENSIONS.has(ext)) return "jpeg";
  if (HEIC_EXTENSIONS.has(ext)) return "heic";
  if (SIDECAR_EXTENSIONS.has(ext)) return "sidecar";
  return null;
}

/** Filename without directory or extension — used to pair RAW+JPEG+XMP by basename. */
export function basenameOf(filename: string) {
  const withoutDir = filename.split(/[\\/]/).pop() ?? filename;
  const dot = withoutDir.lastIndexOf(".");
  return dot === -1 ? withoutDir : withoutDir.slice(0, dot);
}
