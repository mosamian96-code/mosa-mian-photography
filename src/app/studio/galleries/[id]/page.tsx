"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ClientLinksSection } from "./client-links";

type Gallery = {
  id: string;
  folderId: string;
  title: string;
  slug: string;
  description: string | null;
  visibility: "public" | "unlisted" | "password" | "private";
  sortMode: "capture_date" | "upload_date" | "filename" | "manual";
  downloadsPolicy: "off" | "web" | "original";
  watermarkId: string | null;
  publishedAt: string | null;
};

type Watermark = { id: string; name: string };

type Item = {
  assetId: string;
  filename: string;
  thumbUrl: string | null;
};

type LibraryAsset = {
  id: string;
  filename: string;
  thumbUrl: string | null;
};

export default function GalleryEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [watermarks, setWatermarks] = useState<Watermark[]>([]);
  const [password, setPassword] = useState("");
  const [picking, setPicking] = useState(false);
  const [pickerAssets, setPickerAssets] = useState<LibraryAsset[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/galleries/${id}`);
    const data = await res.json();
    setGallery(data.gallery);
    setItems(data.items);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/id-change; setState happens in load()'s async continuation, not synchronously here.
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/watermarks")
      .then((res) => res.json())
      .then((data) => setWatermarks(data.items));
  }, []);

  async function patch(fields: Record<string, unknown>) {
    setSaving(true);
    const res = await fetch(`/api/galleries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    setSaving(false);
    if (res.ok) load();
  }

  async function openPicker() {
    setPicking(true);
    const res = await fetch("/api/library?offset=0");
    const data = await res.json();
    setPickerAssets(data.items);
  }

  async function addSelected() {
    if (selected.size === 0) return;
    await fetch(`/api/galleries/${id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetIds: [...selected] }),
    });
    setSelected(new Set());
    setPicking(false);
    load();
  }

  async function removeItem(assetId: string) {
    await fetch(`/api/galleries/${id}/items?assetId=${assetId}`, { method: "DELETE" });
    load();
  }

  if (!gallery) return null;

  return (
    <div>
      <Link href={`/studio/folders/${gallery.folderId}`} className="text-sm text-neutral-400 hover:text-neutral-900">
        ← Folder
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-lg font-medium text-neutral-900">{gallery.title}</h1>
        <button
          type="button"
          onClick={() => patch({ publish: !gallery.publishedAt })}
          disabled={saving}
          className={`rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
            gallery.publishedAt ? "border border-neutral-300 hover:bg-neutral-100" : "bg-neutral-900 text-white hover:bg-neutral-700"
          }`}
        >
          {gallery.publishedAt ? "Unpublish" : "Publish"}
        </button>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-neutral-500">Title</span>
          <input
            type="text"
            defaultValue={gallery.title}
            onBlur={(e) => e.target.value !== gallery.title && patch({ title: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-500">Visibility</span>
          <select
            value={gallery.visibility}
            onChange={(e) => patch({ visibility: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 outline-none focus:border-neutral-900"
          >
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="password">Password</option>
            <option value="private">Private (client link only)</option>
          </select>
        </label>
        {gallery.visibility === "password" ? (
          <label className="block text-sm">
            <span className="text-neutral-500">Set password</span>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 rounded border border-neutral-300 px-3 py-1.5 outline-none focus:border-neutral-900"
              />
              <button
                type="button"
                onClick={() => password && patch({ password })}
                className="rounded border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100"
              >
                Set
              </button>
            </div>
          </label>
        ) : null}
        <label className="block text-sm">
          <span className="text-neutral-500">Sort</span>
          <select
            value={gallery.sortMode}
            onChange={(e) => patch({ sortMode: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 outline-none focus:border-neutral-900"
          >
            <option value="capture_date">Capture date</option>
            <option value="upload_date">Upload date</option>
            <option value="filename">Filename</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-neutral-500">Downloads</span>
          <select
            value={gallery.downloadsPolicy}
            onChange={(e) => patch({ downloadsPolicy: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 outline-none focus:border-neutral-900"
          >
            <option value="off">Off</option>
            <option value="web">Web size</option>
            <option value="original">Original</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-neutral-500">Watermark</span>
          <select
            value={gallery.watermarkId ?? ""}
            onChange={(e) => patch({ watermarkId: e.target.value || null })}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 outline-none focus:border-neutral-900"
          >
            <option value="">None</option>
            {watermarks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-900">Photos ({items.length})</h2>
          <button
            type="button"
            onClick={openPicker}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
          >
            Add photos
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {items.map((item) => (
            <figure key={item.assetId} className="group relative aspect-square overflow-hidden rounded bg-neutral-100">
              {item.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbUrl} alt={item.filename} className="h-full w-full object-cover" />
              ) : null}
              <button
                type="button"
                onClick={() => removeItem(item.assetId)}
                className="absolute right-1 top-1 hidden rounded bg-black/70 px-1.5 py-0.5 text-xs text-white group-hover:block"
              >
                Remove
              </button>
            </figure>
          ))}
        </div>
      </section>

      <ClientLinksSection galleryId={gallery.id} />

      {picking ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-6">
          <div className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-neutral-900">Select photos to add</h3>
              <button type="button" onClick={() => setPicking(false)} className="text-sm text-neutral-400">
                Close
              </button>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {pickerAssets.map((asset) => {
                const isSelected = selected.has(asset.id);
                return (
                  <button
                    type="button"
                    key={asset.id}
                    onClick={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(asset.id)) next.delete(asset.id);
                        else next.add(asset.id);
                        return next;
                      })
                    }
                    className={`relative aspect-square overflow-hidden rounded ${isSelected ? "ring-2 ring-neutral-900" : ""}`}
                  >
                    {asset.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.thumbUrl} alt={asset.filename} className="h-full w-full object-cover" />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={addSelected}
              disabled={selected.size === 0}
              className="mt-4 rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Add {selected.size || ""} selected
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
