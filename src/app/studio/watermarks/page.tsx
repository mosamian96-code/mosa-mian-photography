"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Position = "bottom_right" | "bottom_left" | "top_right" | "top_left" | "center" | "tile";

type Watermark = {
  id: string;
  name: string;
  position: Position;
  opacity: number;
  previewUrl: string;
};

const POSITIONS: { value: Position; label: string }[] = [
  { value: "bottom_right", label: "Bottom right" },
  { value: "bottom_left", label: "Bottom left" },
  { value: "top_right", label: "Top right" },
  { value: "top_left", label: "Top left" },
  { value: "center", label: "Center" },
  { value: "tile", label: "Tile" },
];

export default function WatermarksPage() {
  const [items, setItems] = useState<Watermark[]>([]);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/watermarks");
    const data = await res.json();
    setItems(data.items);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState happens in load()'s async continuation.
    load();
  }, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !name.trim()) return;

    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("name", name.trim());
    const res = await fetch("/api/watermarks", { method: "POST", body: form });
    setUploading(false);
    if (res.ok) {
      setName("");
      if (fileRef.current) fileRef.current.value = "";
      load();
    }
  }

  async function patch(id: string, fields: Partial<{ position: Position; opacity: number; name: string }>) {
    await fetch(`/api/watermarks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/watermarks/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1 className="text-lg font-medium text-neutral-900">Watermarks</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Upload a transparent PNG mark, then assign it to a gallery from that gallery&apos;s editor.
      </p>

      <form onSubmit={upload} className="mt-6 flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-4">
        <label className="block text-sm">
          <span className="text-neutral-500">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-48 rounded border border-neutral-300 px-3 py-1.5 outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-500">PNG file</span>
          <input ref={fileRef} type="file" accept="image/png" className="mt-1 block text-sm" />
        </label>
        <button
          type="submit"
          disabled={uploading}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((w) => (
          <div key={w.id} className="rounded border border-neutral-200 p-4">
            <div className="flex items-center justify-center rounded bg-[repeating-conic-gradient(#e5e5e5_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.previewUrl} alt={w.name} className="max-h-24 max-w-full" />
            </div>
            <div className="mt-3 text-sm font-medium text-neutral-900">{w.name}</div>

            <label className="mt-3 block text-sm">
              <span className="text-neutral-500">Position</span>
              <select
                value={w.position}
                onChange={(e) => patch(w.id, { position: e.target.value as Position })}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-1.5 outline-none focus:border-neutral-900"
              >
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block text-sm">
              <span className="text-neutral-500">Opacity ({Math.round(w.opacity * 100)}%)</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={w.opacity}
                onChange={(e) => setItems((prev) => prev.map((p) => (p.id === w.id ? { ...p, opacity: Number(e.target.value) } : p)))}
                onMouseUp={(e) => patch(w.id, { opacity: Number((e.target as HTMLInputElement).value) })}
                onTouchEnd={(e) => patch(w.id, { opacity: Number((e.target as HTMLInputElement).value) })}
                className="mt-1 w-full"
              />
            </label>

            <button
              type="button"
              onClick={() => remove(w.id)}
              className="mt-3 text-sm text-neutral-400 hover:text-red-600"
            >
              Delete
            </button>
          </div>
        ))}
        {items.length === 0 ? <p className="text-sm text-neutral-400">No watermarks uploaded yet.</p> : null}
      </div>
    </div>
  );
}
