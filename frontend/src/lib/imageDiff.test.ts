import { describe, expect, it } from "vitest";
import { pixelDiff, percent } from "./imageDiff";

/** A w×h RGBA buffer filled with one colour. */
const solid = (w: number, h: number, r: number, g: number, b: number, a = 255) => {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
};

const setPixel = (
  buf: Uint8ClampedArray,
  w: number,
  x: number,
  y: number,
  rgba: [number, number, number, number],
) => {
  const i = (y * w + x) * 4;
  buf.set(rgba, i);
};

describe("pixelDiff", () => {
  it("finds nothing between identical images", () => {
    const a = solid(8, 8, 100, 150, 200);
    const b = solid(8, 8, 100, 150, 200);
    const { stats } = pixelDiff(a, b, 8, 8);
    expect(stats.changedPixels).toBe(0);
    expect(stats.changedRatio).toBe(0);
    expect(stats.maxDelta).toBe(0);
    expect(stats.box).toBeNull();
  });

  it("counts a single changed pixel and boxes it", () => {
    const a = solid(10, 10, 0, 0, 0);
    const b = solid(10, 10, 0, 0, 0);
    setPixel(b, 10, 3, 7, [255, 255, 255, 255]);
    const { stats } = pixelDiff(a, b, 10, 10);
    expect(stats.changedPixels).toBe(1);
    expect(stats.box).toEqual({ x: 3, y: 7, w: 1, h: 1 });
    expect(stats.changedRatio).toBeCloseTo(0.01, 6);
  });

  it("boxes a region rather than each pixel", () => {
    const a = solid(20, 20, 0, 0, 0);
    const b = solid(20, 20, 0, 0, 0);
    for (let y = 5; y <= 9; y++) for (let x = 2; x <= 6; x++) setPixel(b, 20, x, y, [255, 0, 0, 255]);
    const { stats } = pixelDiff(a, b, 20, 20);
    expect(stats.changedPixels).toBe(25);
    expect(stats.box).toEqual({ x: 2, y: 5, w: 5, h: 5 });
  });

  it("reports everything changed when the images are opposites", () => {
    const a = solid(4, 4, 0, 0, 0);
    const b = solid(4, 4, 255, 255, 255);
    const { stats } = pixelDiff(a, b, 4, 4);
    expect(stats.changedPixels).toBe(16);
    expect(stats.changedRatio).toBe(1);
    expect(stats.maxDelta).toBeCloseTo(1, 6);
    expect(stats.meanDelta).toBeCloseTo(1, 6);
  });

  it("ignores a difference under the threshold", () => {
    // The reason the threshold exists: compare strictly and JPEG noise lights
    // up the whole frame.
    const a = solid(6, 6, 100, 100, 100);
    const b = solid(6, 6, 101, 101, 101);
    expect(pixelDiff(a, b, 6, 6, { threshold: 0.02 }).stats.changedPixels).toBe(0);
    expect(pixelDiff(a, b, 6, 6, { threshold: 0 }).stats.changedPixels).toBe(36);
  });

  it("still reports the delta of a change it did not count", () => {
    const a = solid(6, 6, 100, 100, 100);
    const b = solid(6, 6, 104, 104, 104);
    const { stats } = pixelDiff(a, b, 6, 6, { threshold: 0.5 });
    expect(stats.changedPixels).toBe(0);
    expect(stats.maxDelta).toBeGreaterThan(0);
  });

  it("weights green above blue, as an eye does", () => {
    const base = solid(2, 2, 0, 0, 0);
    const greener = solid(2, 2, 0, 60, 0);
    const bluer = solid(2, 2, 0, 0, 60);
    expect(pixelDiff(base, greener, 2, 2).stats.maxDelta).toBeGreaterThan(
      pixelDiff(base, bluer, 2, 2).stats.maxDelta * 2,
    );
  });

  it("notices a pixel that only lost its alpha", () => {
    // Same colour, gone transparent: a colour-only comparison misses it.
    const a = solid(4, 4, 200, 50, 50, 255);
    const b = solid(4, 4, 200, 50, 50, 0);
    expect(pixelDiff(a, b, 4, 4).stats.changedPixels).toBe(16);
  });

  it("marks the changed pixels in the overlay", () => {
    const a = solid(4, 4, 0, 0, 0);
    const b = solid(4, 4, 0, 0, 0);
    setPixel(b, 4, 1, 1, [255, 255, 255, 255]);
    const { overlay } = pixelDiff(a, b, 4, 4, { overlay: "mark" });
    const i = (1 * 4 + 1) * 4;
    expect([overlay[i], overlay[i + 1], overlay[i + 2], overlay[i + 3]]).toEqual([207, 63, 69, 255]);
  });

  it("keeps the unchanged pixels faded rather than blank", () => {
    const a = solid(4, 4, 10, 20, 30);
    const b = solid(4, 4, 10, 20, 30);
    const { overlay } = pixelDiff(a, b, 4, 4, { dim: 0.25 });
    expect([overlay[0], overlay[1], overlay[2]]).toEqual([10, 20, 30]);
    expect(overlay[3]).toBeCloseTo(64, -1);
  });

  it("leaves the unchanged pixels transparent in onlyDiff mode", () => {
    const a = solid(4, 4, 10, 20, 30);
    const b = solid(4, 4, 10, 20, 30);
    const { overlay } = pixelDiff(a, b, 4, 4, { overlay: "onlyDiff" });
    expect(overlay[3]).toBe(0);
  });

  it("colours the heat overlay by how big the change is", () => {
    const a = solid(2, 1, 0, 0, 0);
    const b = new Uint8ClampedArray(a);
    setPixel(b, 2, 0, 0, [255, 255, 255, 255]); // large change
    setPixel(b, 2, 1, 0, [20, 20, 20, 255]); // small change
    const { overlay } = pixelDiff(a, b, 2, 1, { overlay: "heat", threshold: 0.001 });
    expect(overlay[0]).toBeGreaterThan(overlay[4]); // hotter red on the big one
    expect(overlay[6]).toBeGreaterThan(overlay[2]); // more blue on the small one
  });

  it("clamps a nonsensical threshold instead of matching nothing", () => {
    const a = solid(2, 2, 0, 0, 0);
    const b = solid(2, 2, 255, 255, 255);
    expect(pixelDiff(a, b, 2, 2, { threshold: -5 }).stats.changedPixels).toBe(4);
    expect(pixelDiff(a, b, 2, 2, { threshold: 99 }).stats.changedPixels).toBe(0);
  });

  it("handles an empty image without dividing by zero", () => {
    const { stats } = pixelDiff(new Uint8ClampedArray(), new Uint8ClampedArray(), 0, 0);
    expect(stats.changedRatio).toBe(0);
    expect(stats.meanDelta).toBe(0);
    expect(stats.box).toBeNull();
  });
});

describe("percent", () => {
  it("reads as a percentage", () => {
    expect(percent(0)).toBe("0%");
    expect(percent(0.5)).toBe("50.0%");
    expect(percent(1)).toBe("100.0%");
  });

  it("does not round a real difference down to nothing", () => {
    // "0%" next to a visible red mark is the worst possible readout.
    expect(percent(0.0001)).toBe("<0.1%");
  });
});
