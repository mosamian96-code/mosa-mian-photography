"use client";

import { useEffect, useRef, useState } from "react";
import { computeJustifiedRows, type JustifyInput } from "@/lib/public-site/justify";

export function JustifiedGrid<T extends JustifyInput>({
  items,
  targetRowHeight = 280,
  gap = 4,
  renderItem,
}: {
  items: T[];
  targetRowHeight?: number;
  gap?: number;
  renderItem: (item: T, width: number, height: number, index: number) => React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Precise justified rows once the real container width is known.
  if (width > 0) {
    const rows = computeJustifiedRows(items, width, targetRowHeight, gap);
    const indexById = new Map(items.map((item, i) => [item.id, i]));
    return (
      <div ref={containerRef} className="flex flex-col" style={{ gap }}>
        {rows.map((row, i) => (
          <div key={i} className="flex" style={{ gap }}>
            {row.items.map((ri) => {
              const index = indexById.get(ri.id);
              if (index === undefined) return null;
              return (
                <div key={ri.id} style={{ width: ri.width, height: ri.height }}>
                  {renderItem(items[index], ri.width, ri.height, index)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  // Before mount (and during SSR), a CSS-only approximation: each item at a fixed row
  // height with its own aspect ratio, wrapped by the browser -- no measurement needed,
  // correct at any viewport width immediately. This is what actually renders in the
  // initial HTML the browser's preload scanner sees, which is what LCP needs; waiting
  // for ResizeObserver before painting anything (the previous version) meant the
  // largest image on the page wasn't discoverable until JS had fully mounted.
  return (
    <div ref={containerRef} className="flex flex-wrap" style={{ gap }}>
      {items.map((item, index) => (
        <div key={item.id} style={{ height: targetRowHeight, aspectRatio: item.aspect }}>
          {renderItem(item, item.aspect * targetRowHeight, targetRowHeight, index)}
        </div>
      ))}
    </div>
  );
}
