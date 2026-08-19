"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

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
  const [folder, setFolder] = useState<Folder | null>(null);
  const [subfolders, setSubfolders] = useState<Folder[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [newFolderTitle, setNewFolderTitle] = useState("");
  const [newGalleryTitle, setNewGalleryTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  if (!folder) return null;

  return (
    <div>
      <Link href="/studio/folders" className="text-sm text-neutral-400 hover:text-neutral-900">
        ← Folders
      </Link>
      <h1 className="mt-2 text-lg font-medium text-neutral-900">{folder.title}</h1>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-neutral-900">Subfolders</h2>
        <form onSubmit={createSubfolder} className="mt-2 flex gap-2">
          <input
            type="text"
            placeholder="New subfolder title"
            value={newFolderTitle}
            onChange={(e) => setNewFolderTitle(e.target.value)}
            required
            className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-900"
          />
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Create
          </button>
        </form>
        <ul className="mt-3 divide-y divide-neutral-200 rounded border border-neutral-200">
          {subfolders.map((f) => (
            <li key={f.id}>
              <Link href={`/studio/folders/${f.id}`} className="block px-4 py-2 text-sm hover:bg-neutral-50">
                {f.title}
              </Link>
            </li>
          ))}
          {subfolders.length === 0 ? <li className="px-4 py-3 text-sm text-neutral-400">None</li> : null}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-neutral-900">Galleries</h2>
        <form onSubmit={createGallery} className="mt-2 flex gap-2">
          <input
            type="text"
            placeholder="New gallery title"
            value={newGalleryTitle}
            onChange={(e) => setNewGalleryTitle(e.target.value)}
            required
            className="flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-900"
          />
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Create
          </button>
        </form>
        <ul className="mt-3 divide-y divide-neutral-200 rounded border border-neutral-200">
          {galleries.map((g) => (
            <li key={g.id}>
              <Link
                href={`/studio/galleries/${g.id}`}
                className="flex items-center justify-between px-4 py-2 text-sm hover:bg-neutral-50"
              >
                <span>{g.title}</span>
                <span className="text-xs text-neutral-400">{g.publishedAt ? "published" : "draft"}</span>
              </Link>
            </li>
          ))}
          {galleries.length === 0 ? <li className="px-4 py-3 text-sm text-neutral-400">None</li> : null}
        </ul>
      </section>
    </div>
  );
}
