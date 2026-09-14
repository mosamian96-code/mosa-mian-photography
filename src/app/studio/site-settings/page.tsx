"use client";

import { useCallback, useEffect, useState } from "react";

type Settings = {
  profileAssetId: string | null;
  heroAssetId: string | null;
  profileUrl: string | null;
  heroUrl: string | null;
  tagline: string | null;
  aboutBio: string | null;
  socialInstagram: string | null;
  socialFacebook: string | null;
  socialLinkedin: string | null;
  socialEmail: string | null;
};

type LibraryAsset = { id: string; filename: string; thumbUrl: string | null };

export default function SiteSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [picking, setPicking] = useState<"profile" | "hero" | null>(null);
  const [pickerAssets, setPickerAssets] = useState<LibraryAsset[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/site-settings");
    setSettings(await res.json());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState happens in load()'s async continuation.
    load();
  }, [load]);

  async function patch(fields: Record<string, unknown>) {
    setSaving(true);
    await fetch("/api/site-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    setSaving(false);
    load();
  }

  async function openPicker(which: "profile" | "hero") {
    setPicking(which);
    const res = await fetch("/api/library?offset=0");
    const data = await res.json();
    setPickerAssets(data.items);
  }

  async function pick(assetId: string) {
    if (picking === "profile") await patch({ profileAssetId: assetId });
    else if (picking === "hero") await patch({ heroAssetId: assetId });
    setPicking(null);
  }

  if (!settings) return null;

  return (
    <div>
      <h1 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">Site settings</h1>
      <p className="mt-1 text-sm text-neutral-500">Profile photo, hero image, and about/contact info for the public homepage.</p>

      <section className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <span className="block text-sm text-neutral-500 dark:text-neutral-400">Profile photo</span>
          <button
            type="button"
            onClick={() => openPicker("profile")}
            className="mt-2 block h-24 w-24 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900"
          >
            {settings.profileUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.profileUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center text-xs text-neutral-400 dark:text-neutral-500">Choose</span>
            )}
          </button>
        </div>

        <div>
          <span className="block text-sm text-neutral-500 dark:text-neutral-400">Hero photo</span>
          <button
            type="button"
            onClick={() => openPicker("hero")}
            className="mt-2 block aspect-video w-full max-w-sm overflow-hidden rounded bg-neutral-100 dark:bg-neutral-900"
          >
            {settings.heroUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.heroUrl} alt="Hero" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center text-xs text-neutral-400 dark:text-neutral-500">Choose</span>
            )}
          </button>
        </div>

        <label className="block text-sm">
          <span className="text-neutral-500 dark:text-neutral-400">Tagline</span>
          <input
            type="text"
            defaultValue={settings.tagline ?? ""}
            placeholder="Photographer based in Kalmar, Sweden"
            onBlur={(e) => e.target.value !== settings.tagline && patch({ tagline: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-400"
          />
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="text-neutral-500 dark:text-neutral-400">About bio</span>
          <textarea
            defaultValue={settings.aboutBio ?? ""}
            rows={5}
            onBlur={(e) => e.target.value !== settings.aboutBio && patch({ aboutBio: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-400"
          />
        </label>

        <label className="block text-sm">
          <span className="text-neutral-500 dark:text-neutral-400">Instagram URL</span>
          <input
            type="text"
            defaultValue={settings.socialInstagram ?? ""}
            placeholder="https://instagram.com/..."
            onBlur={(e) => e.target.value !== settings.socialInstagram && patch({ socialInstagram: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-400"
          />
        </label>

        <label className="block text-sm">
          <span className="text-neutral-500 dark:text-neutral-400">Facebook URL</span>
          <input
            type="text"
            defaultValue={settings.socialFacebook ?? ""}
            placeholder="https://facebook.com/..."
            onBlur={(e) => e.target.value !== settings.socialFacebook && patch({ socialFacebook: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-400"
          />
        </label>

        <label className="block text-sm">
          <span className="text-neutral-500 dark:text-neutral-400">LinkedIn URL</span>
          <input
            type="text"
            defaultValue={settings.socialLinkedin ?? ""}
            placeholder="https://linkedin.com/in/..."
            onBlur={(e) => e.target.value !== settings.socialLinkedin && patch({ socialLinkedin: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-400"
          />
        </label>

        <label className="block text-sm">
          <span className="text-neutral-500 dark:text-neutral-400">Contact email</span>
          <input
            type="email"
            defaultValue={settings.socialEmail ?? ""}
            placeholder="hello@mosamianphotography.com"
            onBlur={(e) => e.target.value !== settings.socialEmail && patch({ socialEmail: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-400"
          />
        </label>
      </section>

      {saving ? <p className="mt-4 text-xs text-neutral-400 dark:text-neutral-500">Saving…</p> : null}

      {picking ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-6">
          <div className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded bg-white p-6 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Choose {picking === "profile" ? "profile" : "hero"} photo
              </h3>
              <button type="button" onClick={() => setPicking(null)} className="text-sm text-neutral-400 dark:text-neutral-500">
                Close
              </button>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {pickerAssets.map((asset) => (
                <button
                  type="button"
                  key={asset.id}
                  onClick={() => pick(asset.id)}
                  className="relative aspect-square overflow-hidden rounded bg-neutral-100 hover:opacity-80 dark:bg-neutral-800"
                >
                  {asset.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.thumbUrl} alt={asset.filename} className="h-full w-full object-cover" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
