import { describe, expect, it } from "vitest";
import { heightForWidth, simplify } from "./aspect";

describe("aspect", () => {
  it("simplifies 1920×1080 to 16:9", () => {
    expect(simplify(1920, 1080)).toEqual({ w: 16, h: 9 });
  });

  it("derives the missing side", () => {
    expect(heightForWidth(1920, 16, 9)).toBe(1080);
  });
});
