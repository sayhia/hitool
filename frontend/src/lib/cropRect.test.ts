import { describe, expect, it } from "vitest";
import { centerAspectCrop, clampRect } from "./cropRect";

describe("centerAspectCrop", () => {
  it("crops a landscape photo to a square from the middle", () => {
    const r = centerAspectCrop(800, 600, 1, 1);
    expect(r).toEqual({ x: 100, y: 0, w: 600, h: 600 });
  });

  it("uses full height when the ratio is taller than the image", () => {
    const r = centerAspectCrop(800, 600, 3, 4);
    expect(r.h).toBe(600);
    expect(r.w).toBe(450);
    expect(r.x).toBe(Math.round((800 - 450) / 2));
  });

  it("keeps the whole image when the ratio matches", () => {
    const r = centerAspectCrop(640, 480, 4, 3);
    expect(r).toEqual({ x: 0, y: 0, w: 640, h: 480 });
  });
});

describe("clampRect", () => {
  it("pulls overflowing rects back inside", () => {
    expect(clampRect({ x: -10, y: 20, w: 2000, h: 50 }, 100, 100)).toEqual({
      x: 0,
      y: 20,
      w: 100,
      h: 50,
    });
  });

  it("keeps at least a single pixel", () => {
    expect(clampRect({ x: 90, y: 90, w: 0, h: 0 }, 100, 100).w).toBe(1);
  });

  it("shrinks width when x eats into it", () => {
    expect(clampRect({ x: 80, y: 0, w: 50, h: 50 }, 100, 100).w).toBe(20);
  });
});
