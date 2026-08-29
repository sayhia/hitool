import { describe, expect, it } from "vitest";
import { gridRects } from "./gridSplit";

describe("gridRects", () => {
  it("returns cols*rows tiles", () => {
    expect(gridRects(900, 900, 3, 3)).toHaveLength(9);
  });

  it("tiles the source exactly for even divisions", () => {
    const rects = gridRects(900, 900, 3, 3);
    for (const r of rects) expect(r).toEqual({ x: expect.any(Number), y: expect.any(Number), w: 300, h: 300 });
    expect(rects[8]).toEqual({ x: 600, y: 600, w: 300, h: 300 });
  });

  it("hands leftover pixels to the leading cells", () => {
    const rects = gridRects(100, 101, 3, 3);
    const widths = rects.slice(0, 3).map((r) => r.w);
    expect(widths).toEqual([34, 33, 33]);
    const heights = [rects[0].h, rects[3].h, rects[6].h];
    expect(heights).toEqual([34, 34, 33]);
  });

  it("covers every pixel without gaps or overlaps", () => {
    const w = 97;
    const h = 89;
    const rects = gridRects(w, h, 4, 3);
    const cover = new Uint8Array(w * h);
    for (const r of rects) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) cover[y * w + x]++;
      }
    }
    expect([...cover].every((c) => c === 1)).toBe(true);
  });
});
