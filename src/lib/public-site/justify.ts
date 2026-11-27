export type JustifyInput = { id: string; aspect: number };
export type JustifiedItem = { id: string; width: number; height: number };
export type JustifiedRow = { items: JustifiedItem[]; height: number };

function finalizeRow(row: JustifyInput[], containerWidth: number, targetRowHeight: number, gap: number): JustifiedRow {
  const gapsWidth = (row.length - 1) * gap;
  const sumWidthAtTarget = row.reduce((s, it) => s + it.aspect * targetRowHeight, 0);
  const scale = (containerWidth - gapsWidth) / sumWidthAtTarget;
  const height = targetRowHeight * scale;
  return {
    items: row.map((it) => ({ id: it.id, width: it.aspect * height, height })),
    height,
  };
}

/**
 * Classic justified-gallery row computation (brief section 8: "justified grid
 * respecting native aspect ratios, no square crops"). Each full row is scaled to
 * exactly fill the container width; the final row is left at its natural size rather
 * than stretched if it falls well short of a full row, avoiding an oversized close.
 */
export function computeJustifiedRows(
  items: JustifyInput[],
  containerWidth: number,
  targetRowHeight: number,
  gap: number,
): JustifiedRow[] {
  if (containerWidth <= 0 || items.length === 0) return [];

  const rows: JustifiedRow[] = [];
  let currentRow: JustifyInput[] = [];
  let currentWidthAtTarget = 0;

  for (const item of items) {
    const widthAtTarget = item.aspect * targetRowHeight;
    const gapsWidth = currentRow.length * gap;
    if (currentRow.length > 0 && currentWidthAtTarget + widthAtTarget + gapsWidth > containerWidth) {
      rows.push(finalizeRow(currentRow, containerWidth, targetRowHeight, gap));
      currentRow = [];
      currentWidthAtTarget = 0;
    }
    currentRow.push(item);
    currentWidthAtTarget += widthAtTarget;
  }

  if (currentRow.length > 0) {
    const gapsWidth = (currentRow.length - 1) * gap;
    const naturalWidth = currentWidthAtTarget + gapsWidth;
    if (naturalWidth < containerWidth * 0.9) {
      rows.push({
        items: currentRow.map((it) => ({ id: it.id, width: it.aspect * targetRowHeight, height: targetRowHeight })),
        height: targetRowHeight,
      });
    } else {
      rows.push(finalizeRow(currentRow, containerWidth, targetRowHeight, gap));
    }
  }

  return rows;
}

/** The aspect ratio a "photos per row" promise is made for: an ordinary landscape. */
const LANDSCAPE_ASPECT = 1.5;

/**
 * The row height to aim for so that at least `minPerRow` landscape photos fit side by
 * side, never taller than `targetRowHeight`.
 *
 * The small/medium/large toggle used to be fixed heights (160/260/420). On a phone's
 * ~343px column a landscape photo at 260px tall is already wider than the screen, so
 * Medium and Large both became "one photo, full width" and Small barely differed --
 * the toggle looked broken. Capping the height by width keeps desktop exactly as it
 * was (the fixed heights already fit there) and gives phones 3/2/1 photos per row.
 */
export function rowHeightForWidth(targetRowHeight: number, containerWidth: number, minPerRow: number, gap: number) {
  if (containerWidth <= 0 || minPerRow < 1) return targetRowHeight;
  // Floor, so the row-break check in computeJustifiedRows (strict ">") lets exactly
  // minPerRow photos through rather than tipping over on a rounding error.
  const fitting = Math.floor((containerWidth - gap * (minPerRow - 1)) / (minPerRow * LANDSCAPE_ASPECT));
  return Math.max(1, Math.min(targetRowHeight, fitting));
}
