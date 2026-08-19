"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Folder = {
  id: string;
  parentId: string | null;
  title: string;
  slug: string;
  visibility: string;
};

export default function FoldersPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/folders");
    const data = await res.json();
    setFolders(data.items);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState happens in load()'s async continuation, not synchronously here.
    load();
  }, []);

  async function createRootFolder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, parentId: null }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "failed to create folder");
      return;
    }
    setTitle("");
    load();
  }

  const roots = folders.filter((f) => f.parentId === null);

  return (
    <div>
      <h1 className="text-lg font-medium text-neutral-900">Folders</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Top-level folders. Each can hold nested subfolders and galleries.
      </p>

      <form onSubmit={createRootFolder} className="mt-6 flex gap-2">
        <input
          type="text"
          placeholder="New folder title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      <ul className="mt-6 divide-y divide-neutral-200 rounded border border-neutral-200">
        {roots.map((f) => (
          <li key={f.id}>
            <Link
              href={`/studio/folders/${f.id}`}
              className="flex items-center justify-between px-4 py-3 text-sm hover:bg-neutral-50"
            >
              <span className="text-neutral-900">{f.title}</span>
              <span className="text-neutral-400">{f.visibility}</span>
            </Link>
          </li>
        ))}
        {roots.length === 0 ? <li className="px-4 py-6 text-sm text-neutral-400">No folders yet.</li> : null}
      </ul>
    </div>
  );
}
