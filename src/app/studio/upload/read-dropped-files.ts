// The File and Directory Entries API (webkitGetAsEntry / FileSystemDirectoryReader) is
// legacy/webkit-prefixed and isn't in TS's DOM lib, so it's typed minimally here rather
// than pulling in a whole @types package for one function.
interface FSEntry {
  isFile: boolean;
  isDirectory: boolean;
  fullPath: string;
}
interface FSFileEntry extends FSEntry {
  file(success: (file: File) => void, error: (err: unknown) => void): void;
}
interface FSDirectoryReader {
  readEntries(success: (entries: FSEntry[]) => void, error: (err: unknown) => void): void;
}
interface FSDirectoryEntry extends FSEntry {
  createReader(): FSDirectoryReader;
}

function readAllEntries(reader: FSDirectoryReader): Promise<FSEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FSEntry[] = [];
    // readEntries only returns one batch at a time (browser-implementation-defined
    // size) — must be called repeatedly until it returns empty.
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          readBatch();
        }
      }, reject);
    };
    readBatch();
  });
}

async function readEntry(entry: FSEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      (entry as FSFileEntry).file((file) => resolve([file]), reject);
    });
  }
  if (entry.isDirectory) {
    const entries = await readAllEntries((entry as FSDirectoryEntry).createReader());
    const nested = await Promise.all(entries.map(readEntry));
    return nested.flat();
  }
  return [];
}

/** Recursively walks a dropped folder (or files) into a flat File list. */
export async function readDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items);
  const entries = items
    .map((item) => (item as unknown as { webkitGetAsEntry(): FSEntry | null }).webkitGetAsEntry?.())
    .filter((e): e is FSEntry => e != null);

  if (entries.length === 0) {
    // Fallback for browsers without webkitGetAsEntry: flat file drop, no subfolders.
    return Array.from(dataTransfer.files);
  }

  const nested = await Promise.all(entries.map(readEntry));
  return nested.flat();
}
