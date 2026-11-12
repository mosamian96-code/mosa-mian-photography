import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { NextResponse } from "next/server";
import { logError } from "@/lib/error-log";
import { getObjectStream } from "@/lib/storage";

export type ZipEntry = { storageKey: string; filename: string };

/** Case-insensitive because Windows and macOS extract "IMG_1.JPG" and "img_1.jpg" to
 * the same file. Loops until free, so an existing "a (1).jpg" can't collide with a
 * renamed second "a.jpg". Directory parts are dropped so no entry can extract outside
 * the folder it's unzipped into. */
function uniqueEntryName(filename: string, used: Set<string>) {
  const base = filename.split(/[\\/]/).pop() || "file";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let candidate = base;
  for (let n = 1; used.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

function appendAndWait(archive: ZipArchive, stream: Readable, name: string) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      archive.off("entry", onEntry);
      archive.off("close", onClose);
      stream.off("error", onError);
    };
    const onEntry = () => {
      cleanup();
      resolve();
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onClose = () => {
      cleanup();
      reject(new Error("archive closed before the entry finished"));
    };
    archive.on("entry", onEntry);
    archive.on("close", onClose);
    stream.on("error", onError);
    archive.append(stream, { name });
  });
}

/**
 * Streams a zip of storage objects as the response body, fetching each object only
 * once the archive has finished writing the previous one.
 *
 * The routes this replaced requested every object up front and let archiver read them
 * one by one. A 300-photo gallery therefore held every connection in the storage
 * client's 50-socket pool open and unread, so every other storage call in the app --
 * thumbnails, the health check -- queued behind it and failed with "did not establish
 * a connection within the configured timeout". When the visitor gave up, nothing
 * destroyed those unread streams, so the pool stayed exhausted until the app restarted.
 * Reproduced locally: 50 unread bodies make the 51st request fail with exactly that
 * error, and destroying them frees the pool immediately. Here a download holds at most
 * one connection, and a disconnect destroys it.
 */
export function zipResponse(
  context: string,
  zipName: string,
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
  signal?: AbortSignal,
) {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  // An EventEmitter with no 'error' listener throws an uncaught exception when
  // destroy(error) runs or the visitor disconnects mid-download.
  archive.on("error", () => {});

  let current: Readable | null = null;
  let aborted = false;
  const abort = () => {
    aborted = true;
    current?.destroy();
  };
  // Cancelling the response body (the visitor closing the tab) destroys the archive,
  // which emits 'close' -- that, or the request's own abort signal, ends the loop.
  archive.once("close", abort);
  signal?.addEventListener("abort", abort, { once: true });

  (async () => {
    try {
      const used = new Set<string>();
      for await (const entry of entries) {
        if (aborted) return;
        const name = uniqueEntryName(entry.filename, used);
        const stream = await getObjectStream(entry.storageKey);
        if (aborted) {
          stream.destroy();
          return;
        }
        current = stream;
        await appendAndWait(archive, stream, name);
        current = null;
      }
      if (!aborted) await archive.finalize();
    } catch (err) {
      current?.destroy();
      if (aborted) return;
      await logError(context, err);
      archive.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  const safeName = zipName.replace(/[^\w.-]+/g, "_").slice(0, 100) || "photos";
  return new NextResponse(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName}.zip"`,
    },
  });
}
