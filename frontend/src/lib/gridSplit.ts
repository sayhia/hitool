/**
 * Splits an image area into a cols×rows grid. Leftover pixels from the
 * integer division are handed to the leading cells one each, so the tiles
 * always tile the source exactly — no gaps, no overlaps, no fractional
 * canvas rects.
 */
import type { CropRect } from "./cropRect";

export function gridRects(w: number, h: number, cols: number, rows: number): CropRect[] {
  const cw = Math.floor(w / cols);
  const ch = Math.floor(h / rows);
  const extraX = w - cw * cols;
  const extraY = h - ch * rows;

  const out: CropRect[] = [];
  let y = 0;
  for (let r = 0; r < rows; r++) {
    const cellH = ch + (r < extraY ? 1 : 0);
    let x = 0;
    for (let c = 0; c < cols; c++) {
      const cellW = cw + (c < extraX ? 1 : 0);
      out.push({ x, y, w: cellW, h: cellH });
      x += cellW;
    }
    y += cellH;
  }
  return out;
}
