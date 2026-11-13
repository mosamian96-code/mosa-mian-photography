"use client";

import { useCallback, useEffect, useState } from "react";
import { type ActivityItem, describeActivity, linkSummary, relativeTime } from "@/lib/client-activity-format";

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
  lastViewedAt: string | null;
  viewCount: number;
  downloadCount: number;
  sentAt: string | null;
  sentTo: string | null;
};

const FIELD =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

/** The link's last day. Saved when the field loses focus, not on every change: typing a
 * year fires a change per digit (0002, 0020, 0202, 2026), and saving each one could land
 * out of order. Remounted (via key) when the saved value changes. */
function ExpiryField({ value, onCommit }: { value: string; onCommit: (date: string) => Promise<string | null> }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-1.5" title="The link stops working after this day. The client gets a reminder 3 days before.">
      Expires
      <input
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={async () => {
          if (draft === value) return;
          const problem = await onCommit(draft);
          setError(problem);
          if (problem) setDraft(value);
        }}
        className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300"
      />
      {error ? <span className="text-red-600 dark:text-red-400">{error}</span> : null}
    </label>
  );
}

/** "Email to client": sends the branded "your photos are ready" email with the link. */
function SendLinkForm({ link, onDone }: { link: ClientLink; onDone: (sent: boolean) => void }) {
  const [to, setTo] = useState(link.email ?? link.sentTo ?? "");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/client-access/${link.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, message: message.trim() || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "The email couldn't be sent.");
        return;
      }
      onDone(true);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className="mt-3 space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      <label className="block text-xs text-neutral-500 dark:text-neutral-400">
        Client&apos;s email
        <input type="email" required value={to} onChange={(e) => setTo(e.target.value)} className={`mt-1 ${FIELD}`} />
      </label>
      <label className="block text-xs text-neutral-500 dark:text-neutral-400">
        Personal message (optional)
        <textarea
          rows={3}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Your photos are ready to view. Favourite the ones you love and download them whenever you like."
          className={`mt-1 ${FIELD}`}
        />
      </label>
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={sending}
          className="rounded bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {sending ? "Sending…" : "Send email"}
        </button>
        <button
          type="button"
          onClick={() => onDone(false)}
          className="px-2 py-1.5 text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

type DetailItem = { assetId: string; filename: string; thumbUrl: string | null };
type DetailComment = DetailItem & { id: string; body: string; createdAt: string };
type DetailActivity = ActivityItem & { id: string; createdAt: string };
type Detail = { favorites: DetailItem[]; comments: DetailComment[]; activity: DetailActivity[] };

export function ClientLinksSection({ galleryId }: { galleryId: string }) {
  const [links, setLinks] = useState<ClientLink[]>([]);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [sendingFor, setSendingFor] = useState<string | null>(null);

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

  /** Returns the server's reason when it refuses the change, null on success. */
  async function patchLink(id: string, fields: Record<string, unknown>): Promise<string | null> {
    const res = await fetch(`/api/client-access/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    load();
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data.error ?? "Couldn't save that change.";
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
                  {link.revokedAt ? null : (
                    <button
                      type="button"
                      onClick={() => setSendingFor(sendingFor === link.id ? null : link.id)}
                      className="hover:text-neutral-900 dark:hover:text-neutral-100"
                    >
                      Email to client
                    </button>
                  )}
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
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {linkSummary(link)}
                {link.lastViewedAt || link.downloadCount > 0 ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => toggleExpand(link.id)}
                      className="underline-offset-2 hover:text-neutral-900 hover:underline dark:hover:text-neutral-100"
                    >
                      {expanded === link.id ? "Hide activity" : "Activity"}
                    </button>
                  </>
                ) : null}
              </p>
              {link.sentAt ? (
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Emailed{link.sentTo ? ` to ${link.sentTo}` : ""} {relativeTime(new Date(link.sentAt))}
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
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
                <ExpiryField
                  key={link.expiresAt ?? "none"}
                  value={link.expiresAt ? link.expiresAt.slice(0, 10) : ""}
                  onCommit={(date) => patchLink(link.id, { expiresAt: date || null })}
                />
              </div>

              {sendingFor === link.id ? (
                <SendLinkForm
                  link={link}
                  onDone={(sent) => {
                    setSendingFor(null);
                    if (sent) load();
                  }}
                />
              ) : null}

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

                  <h3 className="mt-4 text-xs font-medium text-neutral-700 dark:text-neutral-300">Activity</h3>
                  {detail.activity.length > 0 ? (
                    <ol className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                      {detail.activity.map((a) => (
                        <li key={a.id} className="flex items-baseline justify-between gap-3 text-xs">
                          <span className="min-w-0 truncate text-neutral-600 dark:text-neutral-400">{describeActivity(a)}</span>
                          <time
                            dateTime={a.createdAt}
                            title={new Date(a.createdAt).toLocaleString("en-GB")}
                            className="shrink-0 tabular-nums text-neutral-400 dark:text-neutral-500"
                          >
                            {relativeTime(new Date(a.createdAt))}
                          </time>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">Nothing yet.</p>
                  )}
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
