"use client";

import { useEffect, useRef } from "react";

/** Thin fixed line along the top edge of the content column tracking scroll position
 * within the current page -- quiet orientation for long galleries, not a decorative
 * loading bar. Pure transform (no layout writes), updated via rAF-throttled scroll
 * listener so it never competes with scroll performance itself. */
export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ticking = false;
    function update() {
      ticking = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0;
      if (barRef.current) barRef.current.style.transform = `scaleX(${ratio})`;
    }
    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="pointer-events-none sticky top-0 z-40 h-px w-full bg-transparent">
      <div ref={barRef} className="h-full origin-left bg-neutral-900/70" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}
