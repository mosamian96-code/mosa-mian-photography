"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ClientLinksSection } from "./client-links";
import { GallerySettingsModal } from "./gallery-settings-modal";
import { StudioLightbox } from "./studio-lightbox";
import { UploadDropzone } from "@/app/studio/upload/upload-dropzone";

type Gallery = {
  id: string;
  folderId: string;
  title: string;
  slug: string;
  description: string | null;
  visibility: "public" | "unlisted" | "password" | "private";
  sortMode: "capture_date" | "upload_date" | "filename" | "manual";
  sortDirection: "asc" | "desc" | null;
  downloadsPolicy: "off" | "web" | "original";
  publicDownloadsPolicy: "off" | "web" | "original";
  metaKeywords: string | null;
  showCameraInfo: boolean;
  showFilenames: boolean;
  slideshowEnabled: boolean;
  mapEnabled: boolean;
  rightClickMessage: string | null;
  searchable: boolean;
  watermarkId: string | null;
  coverAssetId: string | null;
  publishedAt: string | null;
};

type Watermark = { id: string; name: string };

type Item = {
  assetId: string;
  filename: string;
  thumbUrl: string | null;
};

export default function GalleryEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [watermarks, setWatermarks] = useState<Watermark[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [deletingGallery, setDeletingGallery] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const resolveThisGalleryId = useCallback(async () => id, [id]);

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

  async function removeItem(assetId: string) {
    await fetch(`/api/galleries/${id}/items?assetId=${assetId}`, { method: "DELETE" });
    load();
  }

  async function setCover(assetId: string) {
    await patch({ coverAssetId: assetId });
  }

  function moveItem(from: number, to: number) {
    if (from === to) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function saveOrder(currentItems: Item[]) {
    setReordering(true);
    await fetch(`/api/galleries/${id}/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetIds: currentItems.map((i) => i.assetId) }),
    });
    setReordering(false);
    load();
  }

  function toggleBulkSelected(assetId: string) {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }

  async function bulkDelete() {
    if (bulkSelected.size === 0) return;
    if (!window.confirm(`Permanently delete ${bulkSelected.size} photo(s)? This removes them from every gallery.`)) return;
    await Promise.all([...bulkSelected].map((assetId) => fetch(`/api/library/${assetId}`, { method: "DELETE" })));
    setBulkSelected(new Set());
    setBulkMode(false);
    load();
  }

  function bulkDownload() {
    if (bulkSelected.size === 0) return;
    if (!window.confirm(`Download ${bulkSelected.size} photo(s) as a zip?`)) return;
    window.location.href = `/api/library/download-zip?ids=${[...bulkSelected].join(",")}&name=${gallery?.slug ?? "photos"}`;
  }

  function downloadGalleryZip() {
    if (items.length === 0 || !gallery) return;
    if (!window.confirm(`Download all ${items.length} photos in this gallery as a zip?`)) return;
    // galleryId, not a joined list of every item's id -- confirmed live that an
    // ~8KB URL (a ~215-item gallery's ids, comma-joined) got the raw connection
    // refused outright before the request reached the app at all. The server
    // resolves gallery items itself now, same as the public download route already
    // did, so this URL stays small regardless of how many photos are in it.
    window.location.href = `/api/library/download-zip?galleryId=${gallery.id}&name=${gallery.slug}`;
  }

  async function deleteGallery() {
    if (!gallery) return;
    if (
      !window.confirm(
        `Delete the gallery "${gallery.title}"? Its photos stay in your library but will no longer appear here.`,
      )
    )
      return;
    setDeletingGallery(true);
    await fetch(`/api/galleries/${id}`, { method: "DELETE" });
    router.push(`/studio/folders/${gallery.folderId}`);
  }

  if (!gallery) return null;

  return (
    <div>
      <Link href={`/studio/folders/${gallery.folderId}`} className="text-sm text-neutral-400 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-100">
        ← Folder
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">{gallery.title}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Settings
          </button>
          <button
            type="button"
            onClick={deleteGallery}
            disabled={deletingGallery}
            className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            {deletingGallery ? "Deleting…" : "Delete gallery"}
          </button>
          <button
            type="button"
            onClick={() => patch({ publish: !gallery.publishedAt })}
            disabled={saving}
            className={`rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
              gallery.publishedAt
                ? "border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                : "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            }`}
          >
            {gallery.publishedAt ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        {gallery.visibility === "public"
          ? "Public"
          : gallery.visibility === "unlisted"
            ? "Unlisted"
            : gallery.visibility === "password"
              ? "Password protected"
              : "Private (client link only)"}
        {" · "}
        {gallery.publishedAt ? "Published" : "Draft"}
        {gallery.watermarkId ? " · Watermarked" : ""}
      </p>

      {settingsOpen ? (
        <GallerySettingsModal
          gallery={gallery}
          watermarks={watermarks}
          onClose={() => setSettingsOpen(false)}
          onSave={patch}
        />
      ) : null}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Photos ({items.length})</h2>
          {items.length > 0 ? (
            <div className="flex items-center gap-2">
              {bulkMode ? (
                <>
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">{bulkSelected.size} selected</span>
                  <button
                    type="button"
                    onClick={() =>
                      setBulkSelected((prev) =>
                        prev.size === items.length ? new Set() : new Set(items.map((i) => i.assetId)),
                      )
                    }
                    className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                  >
                    {bulkSelected.size === items.length ? "Deselect all" : "Select all"}
                  </button>
                  <button
                    type="button"
                    onClick={bulkDownload}
                    disabled={bulkSelected.size === 0}
                    className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-900"
                  >
                    Download selected
                  </button>
                  <button
                    type="button"
                    onClick={bulkDelete}
                    disabled={bulkSelected.size === 0}
                    className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    Delete selected
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkMode(false);
                      setBulkSelected(new Set());
                    }}
                    className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setBulkMode(true)}
                    className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                  >
                    Select
                  </button>
                  <button
                    type="button"
                    onClick={downloadGalleryZip}
                    className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                  >
                    Download all
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadOpen((v) => !v)}
                    className={`rounded px-3 py-1.5 text-sm font-medium ${
                      uploadOpen
                        ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                        : "border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                    }`}
                  >
                    Upload
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>

        {items.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded border border-dashed border-neutral-300 px-6 py-12 text-center dark:border-neutral-700">
            <PhotoStackIcon />
            <h3 className="mt-4 text-base font-medium text-neutral-900 dark:text-neutral-100">
              Add photos to &ldquo;{gallery.title}&rdquo;
            </h3>
            <p className="mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
              This gallery is empty. Drag RAW, JPEG, HEIC, or .xmp files here, or choose them from
              your computer — each one attaches to this gallery as soon as it finishes uploading.
            </p>
            <div className="mt-5 w-full max-w-md">
              <UploadDropzone resolveGalleryId={resolveThisGalleryId} onProgress={load} contextTitle={gallery.title} />
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              {bulkMode
                ? "Click photos to select them."
                : "Click a photo to see its details. Hover to set cover. Drag to reorder — switches Sort to \"Manual\" automatically."}
              {reordering ? " Saving order…" : null}
            </p>
            {uploadOpen ? (
              <div className="mt-3">
                <UploadDropzone compact resolveGalleryId={resolveThisGalleryId} onProgress={load} contextTitle={gallery.title} />
              </div>
            ) : null}
          </>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {items.map((item, index) => {
            const isCover = gallery.coverAssetId === item.assetId;
            const isSelected = bulkSelected.has(item.assetId);
            return (
              <figure
                key={item.assetId}
                draggable={!bulkMode}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragIndex === null || dragIndex === index) return;
                  moveItem(dragIndex, index);
                  setDragIndex(index);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  saveOrder(items);
                }}
                onClick={() => (bulkMode ? toggleBulkSelected(item.assetId) : setLightboxIndex(index))}
                className={`group relative aspect-square overflow-hidden rounded bg-neutral-100 dark:bg-neutral-900 ${bulkMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"} ${isCover ? "ring-2 ring-neutral-900 dark:ring-neutral-100" : ""} ${isSelected ? "ring-2 ring-blue-500" : ""} ${dragIndex === index ? "opacity-50" : ""}`}
              >
                {item.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbUrl} alt={item.filename} className="h-full w-full object-cover" draggable={false} />
                ) : null}
                {bulkMode ? (
                  <span
                    className={`absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                      isSelected ? "border-blue-500 bg-blue-500 text-white" : "border-white bg-black/40 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                ) : (
                  <>
                    {isCover ? (
                      <span className="absolute left-1 top-1 rounded bg-neutral-900 px-1.5 py-0.5 text-xs text-white">Cover</span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCover(item.assetId);
                        }}
                        className="absolute left-1 top-1 hidden rounded bg-black/70 px-1.5 py-0.5 text-xs text-white group-hover:block"
                      >
                        Set as cover
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(item.assetId);
                      }}
                      className="absolute right-1 top-1 hidden rounded bg-black/70 px-1.5 py-0.5 text-xs text-white group-hover:block"
                    >
                      Remove
                    </button>
                  </>
                )}
              </figure>
            );
          })}
        </div>
      </section>

      {lightboxIndex !== null ? (
        <StudioLightbox
          items={items}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
          onDeleted={() => {
            setLightboxIndex(null);
            load();
          }}
        />
      ) : null}

      <ClientLinksSection galleryId={gallery.id} />
    </div>
  );
}

function PhotoStackIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-neutral-300 dark:text-neutral-600">
      <rect x="4" y="7" width="16" height="13" rx="1.5" />
      <path d="m4 16 4-4 3 3 5-5 4 4" />
      <circle cx="9" cy="10.5" r="1.4" fill="currentColor" stroke="none" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
    </svg>
  );
}
