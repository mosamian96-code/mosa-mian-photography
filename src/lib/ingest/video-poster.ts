import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * One still frame from a video, as a JPEG -- the source for a video's thumbnails, the
 * way a photo's original is. `input` is a local path or an HTTPS URL; from a URL,
 * ffmpeg reads only the byte ranges it needs, so a poster for a large video doesn't
 * mean downloading all of it. Taken 1s in (the very first frame is often black or a
 * fade-in), falling back to the start for shorter clips. ffmpeg applies the
 * container's rotation, so portrait phone videos come out upright.
 */
export async function extractVideoPoster(input: string): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "mmp-poster-"));
  const out = path.join(dir, "poster.jpg");
  let lastError: unknown = new Error("ffmpeg produced no frame");
  try {
    for (const seconds of ["1", "0"]) {
      try {
        await run("ffmpeg", ["-v", "error", "-y", "-ss", seconds, "-i", input, "-frames:v", "1", "-q:v", "2", out], {
          timeout: 120_000,
        });
        const frame = await readFile(out);
        if (frame.length > 0) return frame;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
