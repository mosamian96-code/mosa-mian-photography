"use client";

import { useState } from "react";

type Gallery = {
  id: string;
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
};

type GalleryItem = {
  assetId: string;
  filename: string;
  lqip: string | null;
  thumbUrl: string | null;
};

type Watermark = { id: string; name: string };

const TABS = ["Basics", "Cover Photo", "Security & Sharing", "Photo Protection", "Appearance"] as const;
type Tab = (typeof TABS)[number];

const fieldClass =
  "mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-400";
const labelClass = "block text-sm";
const labelTextClass = "text-neutral-500 dark:text-neutral-400";

function BoolToggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <span className="text-sm text-neutral-700 dark:text-neutral-300">{label}</span>
        {hint ? <p className="text-xs text-neutral-400 dark:text-neutral-500">{hint}</p> : null}
      </div>
      <div className="flex shrink-0 rounded border border-neutral-300 p-0.5 dark:border-neutral-700">
        {[
          { v: false, l: "Off" },
          { v: true, l: "On" },
        ].map((opt) => (
          <button
            key={opt.l}
            type="button"
            onClick={() => onChange(opt.v)}
            className={`rounded px-2.5 py-1 text-xs font-medium ${
              value === opt.v
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-500 dark:text-neutral-400"
            }`}
          >
            {opt.l}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Consolidates the gallery's settings (previously a flat, always-visible grid of
 * fields) into a tabbed dialog, matching the SmugMug "Gallery Settings" pattern the
 * user pointed to directly. Only covers what this system actually has -- SmugMug's
 * own Selling and Smart Rules tabs, "Gallery Preset", "Access" (redundant with
 * Visibility here), "Hide Owner" (single-photographer site, nothing to hide), and
 * "SmugMug Searchable" (platform-specific) have no equivalent. Guest Uploading,
 * public Allow Comments, and Show Sharing Options are real gaps but need their own
 * scoping (open upload/comment endpoints are a different risk class) rather than a
 * field bolted on here. */
export function GallerySettingsModal({
  gallery,
  watermarks,
  onClose,
  onSave,
}: {
  gallery: Gallery;
  watermarks: Watermark[];
  onClose: () => void;
  onSave: (fields: Record<string, unknown>) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("Basics");
  const [title, setTitle] = useState(gallery.title);
  const [description, setDescription] = useState(gallery.description ?? "");
  const [visibility, setVisibility] = useState(gallery.visibility);
  const [password, setPassword] = useState("");
  const [sortMode, setSortMode] = useState(gallery.sortMode);
  const [sortDirection, setSortDirection] = useState(gallery.sortDirection ?? "");
  const [metaKeywords, setMetaKeywords] = useState(gallery.metaKeywords ?? "");
  const [searchable, setSearchable] = useState(gallery.searchable);
  const [downloadsPolicy, setDownloadsPolicy] = useState(gallery.downloadsPolicy);
  const [publicDownloadsPolicy, setPublicDownloadsPolicy] = useState(gallery.publicDownloadsPolicy);
  const [rightClickMessage, setRightClickMessage] = useState(gallery.rightClickMessage ?? "");
  const [showCameraInfo, setShowCameraInfo] = useState(gallery.showCameraInfo);
  const [showFilenames, setShowFilenames] = useState(gallery.showFilenames);
  const [slideshowEnabled, setSlideshowEnabled] = useState(gallery.slideshowEnabled);
  const [mapEnabled, setMapEnabled] = useState(gallery.mapEnabled);
  const [watermarkId, setWatermarkId] = useState(gallery.watermarkId ?? "");
  const [coverAssetId, setCoverAssetId] = useState(gallery.coverAssetId ?? "");
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load gallery items when Cover Photo tab is opened
  const loadGalleryItems = async () => {
    if (galleryItems.length > 0 || loadingItems) return;
    setLoadingItems(true);
    try {
      // /api/galleries/[id]/items only implements POST/PATCH/DELETE (add/reorder/remove);
      // the gallery's own GET already returns items with thumbnails, so reuse that.
      const res = await fetch(`/api/galleries/${gallery.id}`);
      const data = await res.json();
      setGalleryItems(data.items || []);
    } catch (err) {
      console.error("Failed to load gallery items:", err);
    }
    setLoadingItems(false);
  };

  async function save() {
    setSaving(true);
    const fields: Record<string, unknown> = {
      title,
      description,
      visibility,
      sortMode,
      sortDirection: sortDirection || null,
      metaKeywords: metaKeywords.trim() || null,
      searchable,
      downloadsPolicy,
      publicDownloadsPolicy,
      rightClickMessage: rightClickMessage.trim() || null,
      showCameraInfo,
      showFilenames,
      slideshowEnabled,
      mapEnabled,
      watermarkId: watermarkId || null,
      coverAssetId: coverAssetId || null,
    };
    if (visibility === "password" && password) fields.password = password;
    await onSave(fields);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl overflow-hidden rounded bg-white dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="w-44 shrink-0 border-r border-neutral-200 py-4 dark:border-neutral-800">
          <h3 className="px-4 pb-3 text-sm font-medium text-neutral-900 dark:text-neutral-100">Gallery Settings</h3>
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                if (t === "Cover Photo" && galleryItems.length === 0) {
                  loadGalleryItems();
                }
              }}
              className={`block w-full px-4 py-2 text-left text-sm ${
                tab === t
                  ? "border-l-2 border-neutral-900 bg-neutral-100 font-medium text-neutral-900 dark:border-neutral-100 dark:bg-neutral-800 dark:text-neutral-100"
                  : "border-l-2 border-transparent text-neutral-500 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5">
            {tab === "Basics" ? (
              <div className="space-y-4">
                <label className={labelClass}>
                  <span className={labelTextClass}>Title</span>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
                </label>
                <label className={labelClass}>
                  <span className={labelTextClass}>Description</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className={fieldClass}
                  />
                </label>
                <div className="flex gap-3">
                  <label className={`${labelClass} flex-1`}>
                    <span className={labelTextClass}>Sort photos by</span>
                    <select
                      value={sortMode}
                      onChange={(e) => setSortMode(e.target.value as Gallery["sortMode"])}
                      className={fieldClass}
                    >
                      <option value="capture_date">Capture date</option>
                      <option value="upload_date">Upload date</option>
                      <option value="filename">Filename</option>
                      <option value="manual">Manual (drag to reorder)</option>
                    </select>
                  </label>
                  <label className={`${labelClass} w-40 shrink-0`}>
                    <span className={labelTextClass}>Direction</span>
                    <select value={sortDirection} onChange={(e) => setSortDirection(e.target.value)} className={fieldClass}>
                      <option value="">Default</option>
                      <option value="asc">Ascending</option>
                      <option value="desc">Descending</option>
                    </select>
                  </label>
                </div>
                <label className={labelClass}>
                  <span className={labelTextClass}>Meta keywords</span>
                  <input
                    type="text"
                    value={metaKeywords}
                    onChange={(e) => setMetaKeywords(e.target.value)}
                    placeholder="keyword one, keyword two, etc"
                    className={fieldClass}
                  />
                  <span className="mt-1 block text-xs text-neutral-400 dark:text-neutral-500">
                    Comma-separated. Read by search engines, not shown on the page.
                  </span>
                </label>
              </div>
            ) : null}

            {tab === "Cover Photo" ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">
                    Select which photo is your gallery's cover. The next photo in sort order becomes the hover image.
                  </p>
                </div>
                {!loadingItems && galleryItems.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => loadGalleryItems()}
                    className="w-full rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    Load photos from gallery
                  </button>
                ) : loadingItems ? (
                  <p className="text-sm text-neutral-500">Loading...</p>
                ) : (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {galleryItems.map((item) => (
                      <button
                        key={item.assetId}
                        type="button"
                        onClick={() => setCoverAssetId(item.assetId)}
                        className={`relative aspect-square overflow-hidden rounded border-2 transition-colors ${
                          coverAssetId === item.assetId
                            ? "border-neutral-900 dark:border-neutral-100"
                            : "border-neutral-200 hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-500"
                        }`}
                        title={item.filename}
                      >
                        <img
                          src={
                            item.thumbUrl ||
                            item.lqip ||
                            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect fill='%23e5e7eb'/%3E%3C/svg%3E"
                          }
                          alt={item.filename}
                          className="h-full w-full object-cover"
                        />
                        {coverAssetId === item.assetId && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <span className="text-sm font-medium text-white">✓ Cover</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {tab === "Security & Sharing" ? (
              <div className="space-y-4">
                <label className={labelClass}>
                  <span className={labelTextClass}>Visibility</span>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as Gallery["visibility"])}
                    className={fieldClass}
                  >
                    <option value="public">Public — listed on the site</option>
                    <option value="unlisted">Unlisted — reachable by direct link only</option>
                    <option value="password">Password protected</option>
                    <option value="private">Private — client link only</option>
                  </select>
                </label>
                {visibility === "password" ? (
                  <label className={labelClass}>
                    <span className={labelTextClass}>Set password</span>
                    <input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Leave blank to keep the current password"
                      className={fieldClass}
                    />
                  </label>
                ) : null}
                <BoolToggle
                  label="Web searchable"
                  hint="When off, Google and other search engines are asked not to index this gallery, regardless of visibility."
                  value={searchable}
                  onChange={setSearchable}
                />
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  Client proofing links (with their own favorite/comment/download permissions) are managed further
                  down this page, below the photo grid.
                </p>
              </div>
            ) : null}

            {tab === "Photo Protection" ? (
              <div className="space-y-4">
                <label className={labelClass}>
                  <span className={labelTextClass}>Watermark</span>
                  <select value={watermarkId} onChange={(e) => setWatermarkId(e.target.value)} className={fieldClass}>
                    <option value="">None</option>
                    {watermarks.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  <span className={labelTextClass}>Client link downloads</span>
                  <select
                    value={downloadsPolicy}
                    onChange={(e) => setDownloadsPolicy(e.target.value as Gallery["downloadsPolicy"])}
                    className={fieldClass}
                  >
                    <option value="off">Off</option>
                    <option value="web">Web size</option>
                    <option value="original">Original</option>
                  </select>
                  <span className="mt-1 block text-xs text-neutral-400 dark:text-neutral-500">
                    Only affects people you send a client link — regular site visitors can never download photos.
                  </span>
                </label>
                <label className={labelClass}>
                  <span className={labelTextClass}>Visitor downloads</span>
                  <select
                    value={publicDownloadsPolicy}
                    onChange={(e) => setPublicDownloadsPolicy(e.target.value as Gallery["publicDownloadsPolicy"])}
                    className={fieldClass}
                  >
                    <option value="off">Off</option>
                    <option value="web">Web size</option>
                    <option value="original">Original</option>
                  </select>
                  <span className="mt-1 block text-xs text-neutral-400 dark:text-neutral-500">
                    Off by default. When on, anyone who can already view this gallery (via its normal link — public,
                    unlisted, or password-entered) can download individual photos or the whole gallery as a zip, no
                    client link needed.
                  </span>
                </label>
                <label className={labelClass}>
                  <span className={labelTextClass}>Right-click message</span>
                  <input
                    type="text"
                    value={rightClickMessage}
                    onChange={(e) => setRightClickMessage(e.target.value)}
                    placeholder="Leave blank for no message"
                    className={fieldClass}
                  />
                  <span className="mt-1 block text-xs text-neutral-400 dark:text-neutral-500">
                    Shown instead of the browser&rsquo;s right-click menu — a deterrent, not real protection.
                  </span>
                </label>
              </div>
            ) : null}

            {tab === "Appearance" ? (
              <div className="space-y-4">
                <BoolToggle label="Show camera info" hint="Camera, lens, and exposure under each photo." value={showCameraInfo} onChange={setShowCameraInfo} />
                <BoolToggle label="Show filenames" hint="Original filename under each photo." value={showFilenames} onChange={setShowFilenames} />
                <BoolToggle label="Slideshow" hint="Lets visitors auto-advance through the gallery." value={slideshowEnabled} onChange={setSlideshowEnabled} />
                <BoolToggle
                  label="Map"
                  hint="Shows a map of where geotagged photos were taken, when any are."
                  value={mapEnabled}
                  onChange={setMapEnabled}
                />
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
