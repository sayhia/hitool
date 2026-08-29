import { describe, expect, it } from "vitest";
import { placeMenu } from "./menu";

describe("placeMenu", () => {
  const VW = 1000;
  const VH = 800;

  it("keeps the anchor point when there is room", () => {
    expect(placeMenu(100, 100, 200, 240, VW, VH)).toEqual({ x: 100, y: 100 });
  });

  it("slides left when the right edge would overflow", () => {
    expect(placeMenu(900, 100, 200, 240, VW, VH)).toEqual({ x: 1000 - 8 - 200, y: 100 });
  });

  it("flips up when the bottom edge would overflow", () => {
    // Anchored near the floor: the menu opens above the point instead.
    expect(placeMenu(100, 700, 200, 240, VW, VH)).toEqual({ x: 100, y: 700 - 240 });
  });

  it("never escapes the viewport with a menu bigger than the gap", () => {
    // A giant menu right-aligns inside the margin on x and clamps to the
    // top margin on y rather than a negative offset.
    expect(placeMenu(950, 780, 900, 780, VW, VH)).toEqual({ x: 1000 - 8 - 900, y: 8 });
  });

  it("handles a corner anchor with a small menu", () => {
    expect(placeMenu(0, 0, 100, 100, VW, VH)).toEqual({ x: 0, y: 0 });
  });
});
