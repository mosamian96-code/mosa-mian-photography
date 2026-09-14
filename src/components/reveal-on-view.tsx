"use client";

import { useEffect, useRef, useState } from "react";

/** Fades/settles children into place the first time they scroll into view (the
 * "reveal-up" keyframe in globals.css), then disconnects -- a one-time entrance, not
 * a repeating scroll gimmick. Under prefers-reduced-motion the global CSS rule already
 * collapses the animation to ~0ms, so this still just adds "is-visible" and the result
 * is an instant, un-animated appearance rather than content that never shows up. */
export function RevealOnView({
  children,
  delayMs = 0,
  className,
}: {
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? "is-visible" : ""} ${className ?? ""}`}
      style={visible && delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
