"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

type Folder = { id: string; parentId: string | null; title: string; visibility: string };
type Gallery = { id: string; folderId: string; title: string; publishedAt: string | null };

type TreeNode =
  | { kind: "folder"; id: string; parentId: string | null; title: string; visibility: string; children: TreeNode[] }
  | { kind: "gallery"; id: string; parentId: string; title: string; publishedAt: string | null };

function buildTree(folders: Folder[], galleries: Gallery[], parentId: string | null): TreeNode[] {
  const childFolders = folders
    .filter((f) => f.parentId === parentId)
    .map(
      (f): TreeNode => ({
        kind: "folder",
        id: f.id,
        parentId: f.parentId,
        title: f.title,
        visibility: f.visibility,
        children: buildTree(folders, galleries, f.id),
      }),
    );
  const ownGalleries = galleries
    .filter((g) => g.folderId === parentId)
    .map((g): TreeNode => ({ kind: "gallery", id: g.id, parentId: g.folderId, title: g.title, publishedAt: g.publishedAt }));
  return [...childFolders, ...ownGalleries];
}

/** Which folder ids sit on the path down to the currently open folder/gallery, so
 * that path can be auto-expanded on load instead of landing on a collapsed tree with
 * no indication of where you are. */
function findAncestorFolderIds(
  folders: Folder[],
  galleries: Gallery[],
  activeFolderId: string | null,
  activeGalleryId: string | null,
): Set<string> {
  const startId = activeFolderId ?? galleries.find((g) => g.id === activeGalleryId)?.folderId ?? null;
  const ids = new Set<string>();
  let current = startId;
  while (current) {
    ids.add(current);
    current = folders.find((f) => f.id === current)?.parentId ?? null;
  }
  return ids;
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  activeId,
  draggingId,
  onDragStartRow,
  onDropRow,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  activeId: string | null;
  draggingId: string | null;
  onDragStartRow: (node: TreeNode) => void;
  onDropRow: (targetNode: TreeNode) => void;
}) {
  const isActive = node.id === activeId;
  const paddingLeft = 12 + depth * 14;
  const isDragging = draggingId === node.id;

  const dragHandlers = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      onDragStartRow(node);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDropRow(node);
    },
  };

  if (node.kind === "gallery") {
    return (
      <Link
        href={`/studio/galleries/${node.id}`}
        style={{ paddingLeft: paddingLeft + 16 }}
        {...dragHandlers}
        className={`flex cursor-grab items-center gap-1.5 py-1 pr-3 text-sm active:cursor-grabbing ${isDragging ? "opacity-40" : ""} ${
          isActive
            ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
            : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0 opacity-60">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="m4 18 5-5 3 3 4-5 4 5" />
        </svg>
        <span className="truncate">{node.title}</span>
        {!node.publishedAt ? (
          <span className="ml-auto shrink-0 text-[10px] uppercase text-neutral-400 dark:text-neutral-500">draft</span>
        ) : null}
      </Link>
    );
  }

  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        style={{ paddingLeft }}
        {...dragHandlers}
        className={`flex cursor-grab items-center gap-1 pr-3 text-sm active:cursor-grabbing ${isDragging ? "opacity-40" : ""} ${
          isActive
            ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
            : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
        }`}
      >
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          className="flex h-6 w-4 shrink-0 items-center justify-center text-neutral-400 dark:text-neutral-500"
          aria-label={isOpen ? "Collapse" : "Expand"}
        >
          {hasChildren ? (
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={`transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
            >
              <path d="M8 5v14l11-7Z" />
            </svg>
          ) : null}
        </button>
        <Link href={`/studio/folders/${node.id}`} className="flex flex-1 items-center gap-1.5 py-1 truncate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0 opacity-70">
            <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
          </svg>
          <span className="truncate">{node.title}</span>
        </Link>
      </div>
      {isOpen && hasChildren ? (
        <div>
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              activeId={activeId}
              draggingId={draggingId}
              onDragStartRow={onDragStartRow}
              onDropRow={onDropRow}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StudioSidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [autoExpanded, setAutoExpanded] = useState(false);
  const [draggingNode, setDraggingNode] = useState<TreeNode | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createDetailsRef = useRef<HTMLDetailsElement>(null);

  const activeFolderId = pathname.match(/^\/studio\/folders\/([^/]+)/)?.[1] ?? null;
  const activeGalleryId = pathname.match(/^\/studio\/galleries\/([^/]+)/)?.[1] ?? null;
  // A gallery page's own folder counts as the create target too -- otherwise opening
  // a gallery would fall back to "top level" even though you're clearly working
  // inside a specific folder.
  const createParentFolderId = activeFolderId ?? galleries.find((g) => g.id === activeGalleryId)?.folderId ?? null;
  const createParentFolder = folders.find((f) => f.id === createParentFolderId) ?? null;

  const reloadTree = useCallback(async () => {
    const [f, g] = await Promise.all([fetch("/api/folders").then((r) => r.json()), fetch("/api/galleries").then((r) => r.json())]);
    setFolders(f.items);
    setGalleries(g.items);
  }, []);

  useEffect(() => {
    if (!session?.user?.email) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/session-change; setState happens in reloadTree()'s async continuation, not synchronously here.
    reloadTree();
  }, [session?.user?.email, reloadTree]);

  async function createItem(kind: "folder" | "gallery") {
    const title = createTitle.trim();
    if (!title) return;
    setCreateBusy(true);
    setCreateError(null);
    const res = await fetch(kind === "folder" ? "/api/folders" : "/api/galleries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        kind === "folder" ? { title, parentId: createParentFolderId } : { title, folderId: createParentFolderId },
      ),
    });
    setCreateBusy(false);
    if (!res.ok) {
      setCreateError((await res.json().catch(() => ({}))).error ?? "failed to create");
      return;
    }
    const created = await res.json();
    setCreateTitle("");
    if (createDetailsRef.current) createDetailsRef.current.open = false;
    if (createParentFolderId) setExpanded((prev) => new Set(prev).add(createParentFolderId));
    await reloadTree();
    router.push(kind === "folder" ? `/studio/folders/${created.id}` : `/studio/galleries/${created.id}`);
  }

  // Adjusted during render rather than in an effect (React's own recommended pattern
  // for "derive this once when data becomes available") -- expands the path down to
  // whatever folder/gallery the URL points at the first time real data has arrived,
  // then leaves further expand/collapse entirely to the user.
  if (!autoExpanded && folders.length > 0) {
    setAutoExpanded(true);
    const ancestors = findAncestorFolderIds(folders, galleries, activeFolderId, activeGalleryId);
    if (ancestors.size > 0) setExpanded(ancestors);
  }

  const tree = useMemo(() => buildTree(folders, galleries, null), [folders, galleries]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Reordering is scoped to same-kind siblings under the same parent -- dropping a
   * folder onto a gallery, or onto a row under a different parent, is a no-op rather
   * than an implicit move/reparent, which isn't a feature this builds (drag here
   * means "put these in a different order," not "file this somewhere else"). */
  async function handleDrop(target: TreeNode) {
    const dragged = draggingNode;
    setDraggingNode(null);
    if (!dragged || dragged.id === target.id) return;
    if (dragged.kind !== target.kind || dragged.parentId !== target.parentId) return;

    if (dragged.kind === "folder") {
      // Both arrays already arrive ordered by position from their GET endpoints.
      const siblings = folders.filter((f) => f.parentId === dragged.parentId);
      const ids = siblings.map((f) => f.id);
      const from = ids.indexOf(dragged.id);
      const to = ids.indexOf(target.id);
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      await Promise.all(
        ids.map((id, i) => fetch(`/api/folders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position: i }) })),
      );
    } else {
      const siblings = galleries.filter((g) => g.folderId === dragged.parentId);
      const ids = siblings.map((g) => g.id);
      const from = ids.indexOf(dragged.id);
      const to = ids.indexOf(target.id);
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      await Promise.all(
        ids.map((id, i) => fetch(`/api/galleries/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position: i }) })),
      );
    }

    await reloadTree();
  }

  if (!session?.user?.email) return null;

  return (
    <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-neutral-200 bg-neutral-50 py-3 lg:block dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center gap-2 px-3 pb-2">
        <Link
          href="/studio/folders"
          className={`block flex-1 rounded px-2 py-1 text-sm font-medium ${
            pathname === "/studio/folders"
              ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
              : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
          }`}
        >
          All folders
        </Link>
        <details ref={createDetailsRef} className="relative">
          <summary
            aria-label="Create"
            className="flex cursor-pointer list-none items-center gap-1 rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 [&::-webkit-details-marker]:hidden dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            <PlusIcon /> Create
          </summary>
          <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
            <input
              type="text"
              placeholder="Title"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createItem("folder");
              }}
              autoFocus
              className="w-full rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-400"
            />
            <p className="mt-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
              {createParentFolder ? `Inside "${createParentFolder.title}"` : "At the top level"}
            </p>
            {createError ? <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{createError}</p> : null}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={!createTitle.trim() || createBusy}
                onClick={() => createItem("folder")}
                className="flex-1 rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
              >
                Folder
              </button>
              <button
                type="button"
                disabled={!createTitle.trim() || createBusy || !createParentFolderId}
                onClick={() => createItem("gallery")}
                title={!createParentFolderId ? "Open a folder first" : undefined}
                className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                Gallery
              </button>
            </div>
          </div>
        </details>
      </div>
      {tree.length === 0 ? (
        <p className="px-4 text-xs text-neutral-400 dark:text-neutral-500">No folders yet.</p>
      ) : (
        tree.map((node) => (
          <TreeRow
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            onToggle={toggle}
            activeId={activeFolderId ?? activeGalleryId}
            draggingId={draggingNode?.id ?? null}
            onDragStartRow={setDraggingNode}
            onDropRow={handleDrop}
          />
        ))
      )}
    </aside>
  );
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}
