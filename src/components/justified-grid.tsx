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
  renderItem: (item: T, width: number, height: number) => React.ReactNode;
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

  const rows = computeJustifiedRows(items, width, targetRowHeight, gap);
  const itemById = new Map(items.map((item) => [item.id, item]));

  return (
    <div ref={containerRef} className="flex flex-col" style={{ gap }}>
      {rows.map((row, i) => (
        <div key={i} className="flex" style={{ gap }}>
          {row.items.map((ri) => {
            const item = itemById.get(ri.id);
            if (!item) return null;
            return (
              <div key={ri.id} style={{ width: ri.width, height: ri.height }}>
                {renderItem(item, ri.width, ri.height)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
