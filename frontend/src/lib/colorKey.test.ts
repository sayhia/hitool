import { describe, expect, it } from "vitest";
import { parseHexColor, removeColorKey } from "./colorKey";

const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a];

describe("removeColorKey", () => {
  it("knocks out pixels matching the key colour", () => {
    const data = new Uint8ClampedArray([...px(255, 0, 0), ...px(255, 5, 2)]);
    const res = removeColorKey(data, [255, 0, 0], 20);
    expect(res.removed).toBe(2);
    expect(data[3]).toBe(0);
    expect(data[7]).toBe(0);
  });

  it("leaves distant pixels untouched", () => {
    const data = new Uint8ClampedArray([...px(0, 0, 255), ...px(255, 0, 0)]);
    const res = removeColorKey(data, [255, 0, 0], 10);
    expect(res.removed).toBe(1);
    expect(data[3]).toBe(255); // blue stays
    expect(data[7]).toBe(0); // red goes
  });

  it("feathers the band between inner and outer radius", () => {
    // tol 50 → outer d2 7500, inner d2 4500; this pixel sits at d2 5000.
    const data = new Uint8ClampedArray(px(255, 50, 50));
    removeColorKey(data, [255, 0, 0], 50);
    expect(data[3]).toBeGreaterThan(0);
    expect(data[3]).toBeLessThan(255);
  });

  it("never turns negative alpha on already translucent pixels", () => {
    const data = new Uint8ClampedArray(px(255, 0, 0, 100));
    removeColorKey(data, [255, 0, 0], 30);
    expect(data[3]).toBe(0);
  });

  it("treats tolerance 0 as a minimal radius instead of dividing by zero", () => {
    const data = new Uint8ClampedArray(px(255, 0, 0));
    expect(() => removeColorKey(data, [255, 0, 0], 0)).not.toThrow();
  });
});

describe("parseHexColor", () => {
  it("parses six-digit hex", () => {
    expect(parseHexColor("#ff8800")).toEqual([255, 136, 0]);
  });

  it("expands shorthand hex", () => {
    expect(parseHexColor("f80")).toEqual([255, 136, 0]);
  });

  it("rejects junk", () => {
    expect(parseHexColor("nope")).toBeNull();
    expect(parseHexColor("#12345")).toBeNull();
  });
});
