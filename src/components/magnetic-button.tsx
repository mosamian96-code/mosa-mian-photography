"use client";

import { useRef } from "react";
import { useIsCoarsePointer, usePrefersReducedMotion } from "@/lib/motion";

/** Magnetic pull for exactly one button per page (the primary CTA) -- deliberately
 * not a generic wrapper applied everywhere, per the brief's "only for selected
 * buttons, and only if it remains comfortable." Offsets up to 6px toward the cursor
 * within its own bounds, springs back on leave. Disabled outright on touch (no hover
 * to preview it there) and reduced-motion. */
export function MagneticButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  const coarse = useIsCoarsePointer();
  const active = !reduced && !coarse;

  function onMove(e: React.MouseEvent) {
    if (!active || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    ref.current.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px)`;
  }
  function onLeave() {
    if (ref.current) ref.current.style.transform = "translate(0, 0)";
  }

  return (
    <span
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`magnetic inline-block transition-transform duration-300 ease-out ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
