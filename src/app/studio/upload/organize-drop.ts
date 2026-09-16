import type { FileWithPath } from "./read-dropped-files";

type Folder = { id: string; parentId: string | null; title: string };
type Gallery = { id: string; folderId: string; title: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `${path} failed (${res.status})`);
  }
  return res.json();
}

/** Finds a folder by title directly under parentId, creating it if it doesn't exist
 * yet. Race-tolerant: if two files in the same dropped subfolder both try to create
 * it at once, the loser's 409 (slug already exists here) is treated as success --
 * it re-fetches and uses the one the winner just created, rather than surfacing a
 * spurious error for something that isn't actually a problem. */
async function findOrCreateFolder(title: string, parentId: string): Promise<string> {
  const { items } = await api<{ items: Folder[] }>("/api/folders");
  const existing = items.find((f) => f.parentId === parentId && f.title.toLowerCase() === title.toLowerCase());
  if (existing) return existing.id;

  try {
    const created = await api<Folder>("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, parentId }),
    });
    return created.id;
  } catch {
    const retry = await api<{ items: Folder[] }>("/api/folders");
    const nowExisting = retry.items.find((f) => f.parentId === parentId && f.title.toLowerCase() === title.toLowerCase());
    if (nowExisting) return nowExisting.id;
    throw new Error(`could not create or find folder "${title}"`);
  }
}

/** Same idea as findOrCreateFolder, for a gallery directly inside folderId. */
async function findOrCreateGallery(title: string, folderId: string): Promise<string> {
  const { items } = await api<{ items: Gallery[] }>(`/api/galleries?folderId=${folderId}`);
  const existing = items.find((g) => g.title.toLowerCase() === title.toLowerCase());
  if (existing) return existing.id;

  try {
    const created = await api<Gallery>("/api/galleries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, folderId }),
    });
    return created.id;
  } catch {
    const retry = await api<{ items: Gallery[] }>(`/api/galleries?folderId=${folderId}`);
    const nowExisting = retry.items.find((g) => g.title.toLowerCase() === title.toLowerCase());
    if (nowExisting) return nowExisting.id;
    throw new Error(`could not create or find gallery "${title}"`);
  }
}

/** Turns a dropped folder structure into real folders/galleries and routes each file
 * to the gallery its path implies -- "Wedding/IMG1.jpg" creates (or reuses) a
 * gallery called "Wedding" directly under baseFolderId and uploads into it;
 * "2026/Wedding/IMG1.jpg" creates (or reuses) a folder "2026" under baseFolderId
 * first, then the "Wedding" gallery inside that. A file with no folder segment at
 * all (a loose file, not from a dragged folder) has nowhere implied to go and is
 * returned separately rather than guessed at.
 *
 * One API round-trip per distinct path prefix, not per file -- cached by prefix so
 * a 300-photo folder doesn't send 300 redundant "does this folder exist" checks. */
export async function organizeDroppedFiles(
  entries: FileWithPath[],
  baseFolderId: string,
): Promise<{ targeted: { file: File; galleryId: string; galleryTitle: string }[]; untargeted: File[] }> {
  const targeted: { file: File; galleryId: string; galleryTitle: string }[] = [];
  const untargeted: File[] = [];
  const galleryIdCache = new Map<string, Promise<string>>();

  for (const { file, relativePath } of entries) {
    const segments = relativePath.split("/").filter(Boolean);
    segments.pop(); // drop the filename itself
    if (segments.length === 0) {
      untargeted.push(file);
      continue;
    }

    const cacheKey = segments.join("/");
    let galleryIdPromise = galleryIdCache.get(cacheKey);
    if (!galleryIdPromise) {
      galleryIdPromise = (async () => {
        let parentFolderId = baseFolderId;
        // Every segment except the last is a folder; the last is the gallery.
        for (let i = 0; i < segments.length - 1; i++) {
          parentFolderId = await findOrCreateFolder(segments[i], parentFolderId);
        }
        return findOrCreateGallery(segments[segments.length - 1], parentFolderId);
      })();
      galleryIdCache.set(cacheKey, galleryIdPromise);
    }

    targeted.push({ file, galleryId: await galleryIdPromise, galleryTitle: segments[segments.length - 1] });
  }

  return { targeted, untargeted };
}
