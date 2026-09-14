"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { UploadDropzone } from "@/app/studio/upload/upload-dropzone";

type Folder = {
  id: string;
  parentId: string | null;
  title: string;
  slug: string;
  visibility: string;
};

type Gallery = {
  id: string;
  folderId: string;
  title: string;
  slug: string;
  publishedAt: string | null;
};

export default function FolderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [folder, setFolder] = useState<Folder | null>(null);
  const [subfolders, setSubfolders] = useState<Folder[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [newFolderTitle, setNewFolderTitle] = useState("");
  const [newGalleryTitle, setNewGalleryTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const [foldersRes, galleriesRes] = await Promise.all([
      fetch("/api/folders").then((r) => r.json()),
      fetch(`/api/galleries?folderId=${id}`).then((r) => r.json()),
    ]);
    setFolder(foldersRes.items.find((f: Folder) => f.id === id) ?? null);
    setSubfolders(foldersRes.items.filter((f: Folder) => f.parentId === id));
    setGalleries(galleriesRes.items);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/id-change; setState happens in load()'s async continuation, not synchronously here.
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function createSubfolder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newFolderTitle, parentId: id }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setNewFolderTitle("");
    load();
  }

  async function createGallery(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/galleries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newGalleryTitle, folderId: id }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setNewGalleryTitle("");
    load();
  }

  // Backs the "drop photos to create a gallery" flow -- reuses whatever title is
  // currently typed into the form above, so there's one title field either way.
  // Deliberately doesn't clear the input on success -- the dropzone's dialog reads
  // it as the upload's context title while the batch is still running.
  const resolveNewGalleryId = useCallback(async () => {
    const title = newGalleryTitle.trim();
    if (!title) throw new Error("type a gallery title above first");
    const res = await fetch("/api/galleries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, folderId: id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "failed to create gallery");
    }
    const gallery = await res.json();
    load();
    return gallery.id as string;
  }, [newGalleryTitle, id]);

  async function deleteFolder() {
    if (!folder) return;
    const warning =
      subfolders.length > 0 || galleries.length > 0
        ? `Delete "${folder.title}" and everything inside it (${subfolders.length} subfolder(s), ${galleries.length} gallerie(s), and anything nested deeper)? The photos themselves stay in your library, but this entire folder structure will be gone.`
        : `Delete the empty folder "${folder.title}"?`;
    if (!window.confirm(warning)) return;
    setDeleting(true);
    await fetch(`/api/folders/${id}`, { method: "DELETE" });
    router.push(folder.parentId ? `/studio/folders/${folder.parentId}` : "/studio/folders");
  }

  if (!folder) return null;

  return (
    <div>
      <Link href="/studio/folders" className="text-sm text-neutral-400 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-100">
        ← Folders
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">{folder.title}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Download every photo in "${folder.title}" (including nested folders) as a zip?`)) {
                window.location.href = `/api/folders/${id}/download-zip`;
              }
            }}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Download all
          </button>
          <button
            type="button"
            onClick={deleteFolder}
            disabled={deleting}
            className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            {deleting ? "Deleting…" : "Delete folder"}
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Subfolders</h2>
        <form onSubmit={createSubfolder} className="mt-2 flex gap-2">
          <input
            type="text"
            placeholder="New subfolder title"
            value={newFolderTitle}
            onChange={(e) => setNewFolderTitle(e.target.value)}
            required
            className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-400"
          />
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Create
          </button>
        </form>
        <ul className="mt-3 divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {subfolders.map((f) => (
            <li key={f.id}>
              <Link href={`/studio/folders/${f.id}`} className="block px-4 py-2 text-sm hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-900">
                {f.title}
              </Link>
            </li>
          ))}
          {subfolders.length === 0 ? <li className="px-4 py-3 text-sm text-neutral-400 dark:text-neutral-500">None</li> : null}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Galleries</h2>
        <form onSubmit={createGallery} className="mt-2 flex gap-2">
          <input
            type="text"
            placeholder="New gallery title"
            value={newGalleryTitle}
            onChange={(e) => setNewGalleryTitle(e.target.value)}
            required
            className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-400"
          />
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Create
          </button>
        </form>
        <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
          Or type a title above and drop photos below — this creates the gallery and uploads
          straight into it in one step.
        </p>
        <div className="mt-2">
          <UploadDropzone
            compact
            resolveGalleryId={resolveNewGalleryId}
            onProgress={load}
            contextTitle={newGalleryTitle.trim() || undefined}
          />
        </div>
        <ul className="mt-3 divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {galleries.map((g) => (
            <li key={g.id}>
              <Link
                href={`/studio/galleries/${g.id}`}
                className="flex items-center justify-between px-4 py-2 text-sm hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-900"
              >
                <span>{g.title}</span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500">{g.publishedAt ? "published" : "draft"}</span>
              </Link>
            </li>
          ))}
          {galleries.length === 0 ? <li className="px-4 py-3 text-sm text-neutral-400 dark:text-neutral-500">None</li> : null}
        </ul>
      </section>
    </div>
  );
}
