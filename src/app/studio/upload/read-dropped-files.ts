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

/** A dropped/picked file plus its path relative to whatever was dropped -- just the
 * filename ("IMG1.jpg") for a loose file, or folder-prefixed ("Wedding/IMG1.jpg",
 * "2026/Wedding/IMG1.jpg") for anything that came from inside a dragged folder.
 * Nothing here decides what a path means (gallery/folder auto-creation is
 * organize-drop.ts's job) -- this only recovers the structure the browser gave us. */
export type FileWithPath = { file: File; relativePath: string };

async function readEntry(entry: FSEntry): Promise<FileWithPath[]> {
  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      (entry as FSFileEntry).file(
        (file) => resolve([{ file, relativePath: entry.fullPath.replace(/^\/+/, "") }]),
        reject,
      );
    });
  }
  if (entry.isDirectory) {
    const entries = await readAllEntries((entry as FSDirectoryEntry).createReader());
    const nested = await Promise.all(entries.map(readEntry));
    return nested.flat();
  }
  return [];
}

/** Recursively walks a dropped folder (or files) into a flat list, each file tagged
 * with its path relative to the drop -- see FileWithPath. */
export async function readDroppedFiles(dataTransfer: DataTransfer): Promise<FileWithPath[]> {
  const items = Array.from(dataTransfer.items);
  const entries = items
    .map((item) => (item as unknown as { webkitGetAsEntry(): FSEntry | null }).webkitGetAsEntry?.())
    .filter((e): e is FSEntry => e != null);

  if (entries.length === 0) {
    // Fallback for browsers without webkitGetAsEntry: flat file drop, no subfolders.
    return Array.from(dataTransfer.files).map((file) => ({ file, relativePath: file.name }));
  }

  const nested = await Promise.all(entries.map(readEntry));
  return nested.flat();
}

/** Same FileWithPath shape, for files that came from an <input webkitdirectory>
 * picker instead of a drag-drop -- those carry the relative path on the File object
 * itself (webkitRelativePath) rather than needing the FileSystemEntry walk above. */
export function filesWithPathFromFileList(files: File[]): FileWithPath[] {
  return files.map((file) => ({
    file,
    relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}
