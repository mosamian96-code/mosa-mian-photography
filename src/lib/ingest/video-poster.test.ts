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

async function makeVideo(name: string, seconds: number, extraArgs: string[] = []) {
  const file = path.join(dir, name);
  await run("ffmpeg", [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", `testsrc=duration=${seconds}:size=320x240:rate=10`,
    "-pix_fmt", "yuv420p",
    ...extraArgs,
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
    const poster = await extractVideoPoster(await makeVideo("rotated.mp4", 3, ["-metadata:s:v:0", "rotate=90"]));
    const meta = await sharp(poster).metadata();
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
