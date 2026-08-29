import { describe, expect, it } from "vitest";
import { analysePassword, crackLabel } from "./passwordStrength";

describe("analysePassword", () => {
  it("returns empty result for empty input", () => {
    const r = analysePassword("");
    expect(r.score).toBe(0);
    expect(r.hints).toContain("empty");
  });

  it("flags common passwords as hopeless", () => {
    const r = analysePassword("password");
    expect(r.score).toBe(0);
    expect(r.hints).toContain("common");
    expect(analysePassword("123456").score).toBe(0);
  });

  it("rates short single-class passwords low", () => {
    const r = analysePassword("abcdefgh");
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.hints).toContain("short");
    expect(r.hints).toContain("oneClass");
  });

  it("discounts heavy repetition and sequences", () => {
    const repeated = analysePassword("aaaaaaaaaaaa");
    expect(repeated.hints).toContain("repeated");
    const sequence = analysePassword("abcdefghijkl");
    expect(sequence.hints).toContain("sequence");
    expect(sequence.entropy).toBeLessThan(analysePassword("akjdhfjaksld").entropy);
  });

  it("rates a long mixed password highly", () => {
    const r = analysePassword("Tr4in!Sunset&River92");
    expect(r.score).toBeGreaterThanOrEqual(3);
    expect(r.entropy).toBeGreaterThan(80);
    expect(r.hints).not.toContain("short");
  });

  it("counts crack time from entropy", () => {
    const weak = analysePassword("abc");
    const strong = analysePassword("Tr4in!Sunset&River92");
    expect(strong.crackSeconds).toBeGreaterThan(weak.crackSeconds * 1e6);
  });
});

describe("crackLabel", () => {
  it("buckets time into human scales", () => {
    expect(crackLabel(0.5)).toBe("instant");
    expect(crackLabel(30)).toBe("seconds");
    expect(crackLabel(600)).toBe("minutes");
    expect(crackLabel(7200)).toBe("hours");
    expect(crackLabel(86400 * 3)).toBe("days");
    expect(crackLabel(86400 * 400)).toBe("years");
    expect(crackLabel(1e20)).toBe("ages");
  });
});
