"use client";

import { useState } from "react";

/** A speed-bump, not real protection (same honesty as the password gate) --
 * suppresses the browser's context menu on right-click within its children and
 * shows the photographer's own message briefly near the cursor instead. */
export function RightClickGuard({ message, children }: { message: string; children: React.ReactNode }) {
  const [note, setNote] = useState<{ x: number; y: number } | null>(null);

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setNote({ x: e.clientX, y: e.clientY });
    window.setTimeout(() => setNote(null), 2000);
  }

  return (
    <div onContextMenu={onContextMenu}>
      {children}
      {note ? (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded bg-neutral-900 px-3 py-1.5 text-xs text-white shadow-lg"
          style={{ left: note.x + 8, top: note.y + 8 }}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}
