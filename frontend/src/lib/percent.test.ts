import { describe, expect, it } from "vitest";
import { changePercent, isWhatPercent, percentIs, percentOf } from "./percent";

describe("percent", () => {
  it("computes the four common forms", () => {
    expect(percentOf(20, 50)).toBe(10);
    expect(isWhatPercent(10, 50)).toBe(20);
    expect(percentIs(10, 20)).toBe(50);
    expect(changePercent(50, 75)).toBe(50);
  });

  it("returns null on divide-by-zero", () => {
    expect(isWhatPercent(1, 0)).toBeNull();
    expect(percentIs(1, 0)).toBeNull();
    expect(changePercent(0, 1)).toBeNull();
  });
});
