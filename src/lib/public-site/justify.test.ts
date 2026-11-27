import { describe, expect, it } from "vitest";
import { computeJustifiedRows, rowHeightForWidth } from "./justify";

describe("computeJustifiedRows", () => {
  it("fills each full row to exactly the container width", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: String(i), aspect: 1.5 }));
    const rows = computeJustifiedRows(items, 1000, 300, 4);
    expect(rows.length).toBeGreaterThan(1);

    for (const row of rows.slice(0, -1)) {
      const totalWidth = row.items.reduce((s, it) => s + it.width, 0) + (row.items.length - 1) * 4;
      expect(totalWidth).toBeCloseTo(1000, 0);
    }
  });

  it("does not stretch a short final row to fill the container", () => {
    // One item at aspect 1.5, target height 300 -> natural width 450, well under 90% of 1000.
    const rows = computeJustifiedRows([{ id: "a", aspect: 1.5 }], 1000, 300, 4);
    expect(rows).toHaveLength(1);
    expect(rows[0].items[0].height).toBe(300);
    expect(rows[0].items[0].width).toBe(450);
  });

  it("respects native aspect ratio within each row (no square crops)", () => {
    const items = [
      { id: "wide", aspect: 2 },
      { id: "tall", aspect: 0.7 },
    ];
    // At target height 300, wide+tall need 810px + a 4px gap — comfortably fits a
    // 900px container, which is the point: both belong in the same row.
    const rows = computeJustifiedRows(items, 900, 300, 4);
    const row = rows[0];
    const wide = row.items.find((i) => i.id === "wide")!;
    const tall = row.items.find((i) => i.id === "tall")!;
    // Both share the same row height; widths must preserve each item's own aspect.
    expect(wide.width / wide.height).toBeCloseTo(2, 2);
    expect(tall.width / tall.height).toBeCloseTo(0.7, 2);
  });

  it("returns nothing for an empty container width or item list", () => {
    expect(computeJustifiedRows([], 1000, 300, 4)).toEqual([]);
    expect(computeJustifiedRows([{ id: "a", aspect: 1 }], 0, 300, 4)).toEqual([]);
  });
});

describe("rowHeightForWidth", () => {
  const landscapes = Array.from({ length: 12 }, (_, i) => ({ id: String(i), aspect: 1.5 }));
  const perRow = (width: number, target: number, minPerRow: number) =>
    computeJustifiedRows(landscapes, width, rowHeightForWidth(target, width, minPerRow, 4), 4)[0].items.length;

  it("keeps the desktop heights unchanged when they already fit", () => {
    expect(rowHeightForWidth(160, 1120, 3, 4)).toBe(160);
    expect(rowHeightForWidth(260, 1120, 2, 4)).toBe(260);
    expect(rowHeightForWidth(420, 1120, 1, 4)).toBe(420);
  });

  it("gives a phone column 3, 2 and 1 landscape photos per row for small, medium and large", () => {
    // 375px phone minus the page's 16px gutters. Before, medium and large were both 1.
    expect(perRow(343, 160, 3)).toBe(3);
    expect(perRow(343, 260, 2)).toBe(2);
    expect(perRow(343, 420, 1)).toBe(1);
  });

  it("falls back to the target before the width is known", () => {
    expect(rowHeightForWidth(260, 0, 2, 4)).toBe(260);
  });
});
