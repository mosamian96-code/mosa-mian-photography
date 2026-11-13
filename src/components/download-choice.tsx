"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A download control that offers a size when the gallery allows full resolution:
 * "Full resolution" (the original files, for printing) or "Web size" (2560px JPEGs,
 * for sharing). When the gallery allows web size only there's nothing to choose, so it
 * renders a plain link. Each choice is an ordinary link to a download route, which
 * answers with the file (or a zip) as an attachment, so the page never navigates away.
 *
 * `tone` matches where it sits: "light" on the white gallery page, "dark" inside the
 * lightbox. `placement` opens the menu below the trigger (a toolbar) or above it (the
 * lightbox's controls sit near the bottom of the screen).
 */
export function DownloadChoice({
  label,
  webHref,
  originalHref,
  triggerClassName,
  tone,
  placement,
}: {
  label: string;
  webHref: string;
  /** Null when the gallery offers web size only. */
  originalHref: string | null;
  triggerClassName: string;
  tone: "light" | "dark";
  placement: "below" | "above";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!originalHref) {
    return (
      <a href={webHref} className={triggerClassName}>
        {label}
      </a>
    );
  }

  const options = [
    { href: originalHref, title: "Full resolution", detail: "Original files, best for printing" },
    { href: webHref, title: "Web size", detail: "2560px JPEGs, for sharing online" },
  ];
  const dark = tone === "dark";

  return (
    <div
      ref={rootRef}
      className="relative inline-block"
      onKeyDown={(e) => {
        // Closes only the menu: inside the lightbox, Escape would otherwise also reach
        // the lightbox's own window listener and close the photo.
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
      >
        {label}
      </button>
      {open ? (
        <div
          id={menuId}
          className={`absolute z-20 w-64 overflow-hidden rounded border py-1 text-left shadow-lg ${
            placement === "below" ? "right-0 top-full mt-1" : "bottom-full left-1/2 mb-2 -translate-x-1/2"
          } ${dark ? "border-white/10 bg-neutral-900" : "border-neutral-200 bg-white"}`}
          style={{ animation: "reveal-up var(--dur-micro) var(--ease-settle) both" }}
        >
          {options.map((option) => (
            <a
              key={option.title}
              href={option.href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 transition-colors focus-visible:outline-none ${
                dark ? "hover:bg-white/10 focus-visible:bg-white/10" : "hover:bg-neutral-50 focus-visible:bg-neutral-100"
              }`}
            >
              <span className={`block text-sm ${dark ? "text-white" : "text-neutral-900"}`}>{option.title}</span>
              <span className={`mt-0.5 block text-xs ${dark ? "text-white/50" : "text-neutral-500"}`}>{option.detail}</span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
