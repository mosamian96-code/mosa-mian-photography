import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat, appendFile, access } from "node:fs/promises";
import path from "node:path";

const ROOT = "E:\\smugmug-export";
const SUPPORTED = new Set(["dng", "cr3", "cr2", "arw", "nef", "raf", "orf", "rw2", "heic", "heif", "jpg", "jpeg", "xmp"]);
const PROGRESS_FILE = "scratch-hash-progress.ndjson"; // one JSON line per file already processed this run (or a prior run)
const MISSING_FILE = "scratch-missing-files.ndjson"; // subset of the above that's actually missing from the DB

function extOf(filename) {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && SUPPORTED.has(extOf(entry.name))) yield full;
  }
}

async function mapPool(items, limit, fn) {
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const existingRaw = await readFile("scratch-existing-hashes.txt", "utf8");
  const existing = new Set(existingRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  console.log(`loaded ${existing.size} existing DB hashes`);

  // Resume support: paths already hashed in a prior (possibly killed) run are skipped
  // entirely -- this makes the whole scan safe to re-invoke after a timeout.
  const alreadyDone = new Set();
  if (await fileExists(PROGRESS_FILE)) {
    const lines = (await readFile(PROGRESS_FILE, "utf8")).split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        alreadyDone.add(JSON.parse(line).path);
      } catch {}
    }
    console.log(`resuming: ${alreadyDone.size} files already hashed in a prior run`);
  }

  console.log("walking", ROOT);
  const files = [];
  for await (const f of walk(ROOT)) files.push(f);
  console.log(`found ${files.length} candidate files on disk`);

  const todo = files.filter((f) => !alreadyDone.has(f));
  console.log(`${todo.length} left to hash`);

  let done = 0;
  let missingCount = 0;
  const startedAt = Date.now();

  await mapPool(todo, 6, async (filePath) => {
    try {
      const [sha256, st] = await Promise.all([sha256File(filePath), stat(filePath)]);
      const record = { path: filePath, filename: path.basename(filePath), sha256, size: st.size, ext: extOf(filePath) };
      await appendFile(PROGRESS_FILE, JSON.stringify(record) + "\n");
      if (!existing.has(sha256)) {
        await appendFile(MISSING_FILE, JSON.stringify(record) + "\n");
        missingCount++;
      }
      done++;
      if (done % 500 === 0) {
        const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
        const rate = (done / ((Date.now() - startedAt) / 60000)).toFixed(0);
        console.log(`hashed ${done}/${todo.length} this run (${elapsedMin}m elapsed, ~${rate}/min, ${missingCount} missing so far)`);
      }
    } catch (err) {
      console.error(`error hashing ${filePath}:`, err.message);
    }
  });

  console.log(`this run done. ${missingCount} newly-found missing files. Total processed overall: ${alreadyDone.size + done}/${files.length}`);
}

main();
