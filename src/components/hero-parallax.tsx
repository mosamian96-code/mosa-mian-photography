"use client";

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/motion";

/** Homepage hero photo drifts slower than the page scrolls -- a few percent of
 * translateY, capped, applied to a wrapper a little larger than its frame so the
 * shift never reveals an edge. Pure transform via a rAF-throttled scroll listener,
 * same pattern as ScrollProgress. The settle-in keyframe stays on the <img> itself so
 * the two transforms don't fight over the same element. Skipped entirely under
 * prefers-reduced-motion, same as the cursor ring and magnetic button. */
export function HeroParallax({ src }: { src: string }) {
  const reduced = usePrefersReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) return;
    let ticking = false;
    function update() {
      ticking = false;
      const shift = Math.min(window.scrollY, 600) * 0.15;
      if (wrapRef.current) wrapRef.current.style.transform = `translateY(${shift}px)`;
    }
    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [reduced]);

  return (
    <div ref={wrapRef} className="absolute -inset-x-0 -inset-y-[6%]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        style={{ animation: "hero-settle 1.6s var(--ease-settle) both" }}
      />
    </div>
  );
}
