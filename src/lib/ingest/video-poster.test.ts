import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractVideoPoster } from "./video-poster";

const run = promisify(execFile);

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

let dir: string;

async function makeVideo(name: string, seconds: number) {
  const file = path.join(dir, name);
  await run("ffmpeg", [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", `testsrc=duration=${seconds}:size=320x240:rate=10`,
    "-pix_fmt", "yuv420p",
    file,
  ]);
  return file;
}

describe.skipIf(!hasFfmpeg)("extractVideoPoster", () => {
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "poster-test-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns a JPEG frame at the video's dimensions", async () => {
    const poster = await extractVideoPoster(await makeVideo("plain.mp4", 3));
    const meta = await sharp(poster).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([320, 240]);
  });

  it("applies rotation metadata, so portrait phone videos come out upright", async () => {
    // Like a phone video: landscape pixels plus a display-rotation tag, stream-copied
    // so the pixels stay unrotated. ffmpeg 6.1+ sets the tag with -display_rotation;
    // older versions (the worker's Debian ffmpeg 5.1) only understand the rotate
    // metadata key, which newer ones ignore.
    const plain = await makeVideo("to-rotate.mp4", 3);
    const rotated = path.join(dir, "rotated.mp4");
    await run("ffmpeg", ["-v", "error", "-y", "-display_rotation", "90", "-i", plain, "-c", "copy", rotated]).catch(() =>
      run("ffmpeg", ["-v", "error", "-y", "-i", plain, "-c", "copy", "-metadata:s:v:0", "rotate=90", rotated]),
    );

    const meta = await sharp(await extractVideoPoster(rotated)).metadata();
    expect([meta.width, meta.height]).toEqual([240, 320]);
  });

  it("falls back to the first frame for clips shorter than the 1s seek", async () => {
    const poster = await extractVideoPoster(await makeVideo("short.mp4", 0.5));
    expect((await sharp(poster).metadata()).format).toBe("jpeg");
  });

  it("rejects input that isn't a video", async () => {
    await expect(extractVideoPoster(path.join(dir, "missing.mp4"))).rejects.toThrow();
  });
});
