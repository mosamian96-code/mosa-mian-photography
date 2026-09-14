"use client";

import { useCallback, useEffect, useState } from "react";

type ClientLink = {
  id: string;
  token: string;
  email: string | null;
  expiresAt: string | null;
  downloadsEnabled: boolean;
  canFavorite: boolean;
  canComment: boolean;
  revokedAt: string | null;
  favoriteCount: number;
  commentCount: number;
  unreadCommentCount: number;
};

type DetailItem = { assetId: string; filename: string; thumbUrl: string | null };
type DetailComment = DetailItem & { id: string; body: string; createdAt: string };
type Detail = { favorites: DetailItem[]; comments: DetailComment[] };

export function ClientLinksSection({ galleryId }: { galleryId: string }) {
  const [links, setLinks] = useState<ClientLink[]>([]);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/galleries/${galleryId}/client-access`);
    const data = await res.json();
    setLinks(data.items);
  }, [galleryId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState happens in load()'s async continuation.
    load();
  }, [load]);

  async function createLink() {
    setCreating(true);
    await fetch(`/api/galleries/${galleryId}/client-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setCreating(false);
    load();
  }

  async function patchLink(id: string, fields: Record<string, unknown>) {
    await fetch(`/api/client-access/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    load();
  }

  async function toggleExpand(id: string) {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(id);
    const res = await fetch(`/api/client-access/${id}/detail`);
    setDetail(await res.json());
    load(); // unread counts just got marked read server-side
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Client links</h2>
        <button
          type="button"
          onClick={createLink}
          disabled={creating}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          New link
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {links.map((link) => {
          const url = typeof window !== "undefined" ? `${window.location.origin}/g/${link.token}` : `/g/${link.token}`;
          return (
            <div key={link.id} className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(url)}
                  className="truncate font-mono text-xs text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                  title="Click to copy"
                >
                  {url}
                </button>
                <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                  <button type="button" onClick={() => toggleExpand(link.id)} className="hover:text-neutral-900 dark:hover:text-neutral-100">
                    ♥ {link.favoriteCount} · 💬 {link.commentCount}
                    {link.unreadCommentCount > 0 ? (
                      <span className="ml-1 rounded-full bg-neutral-900 px-1.5 text-white dark:bg-neutral-100 dark:text-neutral-900">{link.unreadCommentCount}</span>
                    ) : null}
                  </button>
                  {link.revokedAt ? (
                    <span className="text-red-600 dark:text-red-400">Revoked</span>
                  ) : (
                    <button type="button" onClick={() => patchLink(link.id, { revoke: true })} className="hover:text-red-600 dark:hover:text-red-400">
                      Revoke
                    </button>
                  )}
                </div>
              </div>
              {link.email ? <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">{link.email}</p> : null}

              <div className="mt-2 flex flex-wrap gap-4 text-xs text-neutral-500 dark:text-neutral-400">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={link.downloadsEnabled}
                    onChange={(e) => patchLink(link.id, { downloadsEnabled: e.target.checked })}
                  />
                  Downloads
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={link.canFavorite}
                    onChange={(e) => patchLink(link.id, { canFavorite: e.target.checked })}
                  />
                  Favorites
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={link.canComment}
                    onChange={(e) => patchLink(link.id, { canComment: e.target.checked })}
                  />
                  Comments
                </label>
              </div>

              {expanded === link.id && detail ? (
                <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  {detail.favorites.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {detail.favorites.map((f) => (
                        <div key={f.assetId} className="h-14 w-14 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800" title={f.filename}>
                          {f.thumbUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.thumbUrl} alt={f.filename} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">No favorites yet.</p>
                  )}
                  {detail.comments.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {detail.comments.map((c) => (
                        <li key={c.id} className="flex items-start gap-2 text-xs">
                          <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
                            {c.thumbUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={c.thumbUrl} alt={c.filename} className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <span className="text-neutral-600 dark:text-neutral-400">{c.body}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {links.length === 0 ? <p className="text-sm text-neutral-400 dark:text-neutral-500">No client links yet.</p> : null}
      </div>
    </section>
  );
}
