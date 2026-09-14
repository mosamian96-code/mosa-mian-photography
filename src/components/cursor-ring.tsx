"use client";

import { useEffect, useRef } from "react";
import { useIsCoarsePointer, usePrefersReducedMotion } from "@/lib/motion";

/** Optional-tier refined cursor: a small ring that tracks the pointer and tightens
 * slightly over anything marked [data-cursor="view"] (gallery thumbnails, lightbox
 * triggers), showing a short label inside it -- "View" by default, or whatever the
 * target sets via [data-cursor-label]. Never the only signal something is clickable
 * -- normal hover/focus states underneath are untouched -- and it fully disables
 * itself (no mount, no "has-cursor-ring" class, native pointer stays visible) on
 * touch and reduced-motion, per globals.css's ".has-cursor-ring [data-cursor]" rule. */
export function CursorRing() {
  const reduced = usePrefersReducedMotion();
  const coarse = useIsCoarsePointer();
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const active = !reduced && !coarse;

  useEffect(() => {
    if (!active) return;
    document.documentElement.classList.add("has-cursor-ring");
    const ring = ringRef.current;
    const label = labelRef.current;
    if (!ring || !label) return;

    let targeting = false;

    function onMove(e: MouseEvent) {
      if (!ring) return;
      ring.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = el?.closest('[data-cursor="view"]');
      const isTarget = Boolean(target);
      if (isTarget !== targeting) {
        targeting = isTarget;
        ring.style.width = isTarget ? "56px" : "28px";
        ring.style.height = isTarget ? "56px" : "28px";
        ring.style.marginLeft = isTarget ? "-28px" : "-14px";
        ring.style.marginTop = isTarget ? "-28px" : "-14px";
        if (label) {
          label.textContent = isTarget ? (target?.getAttribute("data-cursor-label") ?? "View") : "";
          label.style.opacity = isTarget ? "1" : "0";
        }
      }
    }
    function onLeave() {
      if (ring) ring.style.opacity = "0";
    }
    function onEnter() {
      if (ring) ring.style.opacity = "1";
    }

    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    return () => {
      document.documentElement.classList.remove("has-cursor-ring");
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
    };
  }, [active]);

  if (!active) return null;
  return (
    <div ref={ringRef} className="cursor-ring" style={{ opacity: 0 }}>
      <span ref={labelRef} className="cursor-ring-label" />
    </div>
  );
}
