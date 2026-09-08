import { describe, expect, it } from "vitest";
import { analysePassword, crackLabel, generatePassphrase, generatePassword, generateBatch, generatePIN } from "./passwordStrength";

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

describe("generatePassphrase", () => {
  it("generates the requested number of words", () => {
    const pp = generatePassphrase(4);
    expect(pp.split("-")).toHaveLength(4);
  });

  it("uses the given separator", () => {
    const pp = generatePassphrase(3, ".");
    expect(pp.split(".")).toHaveLength(3);
  });

  it("returns empty for zero words", () => {
    expect(generatePassphrase(0)).toBe("");
  });

  it("produces different results on each call", () => {
    const a = generatePassphrase(5);
    const b = generatePassphrase(5);
    expect(a).not.toBe(b);
  });
});

describe("generatePassword", () => {
  it("respects length", () => {
    const pw = generatePassword({ length: 20, upper: true, lower: true, digits: false, symbols: false });
    expect(pw).toHaveLength(20);
  });

  it("returns empty when no charset is selected", () => {
    expect(generatePassword({ length: 10, upper: false, lower: false, digits: false, symbols: false })).toBe("");
  });

  it("includes custom characters", () => {
    const pw = generatePassword({ length: 50, upper: false, lower: false, digits: false, symbols: false, custom: "xyz" });
    expect(pw).toHaveLength(50);
    expect([...pw].every((c) => "xyz".includes(c))).toBe(true);
  });

  it("guarantees at least one char from each selected pool", () => {
    const pw = generatePassword({ length: 8, upper: true, lower: true, digits: true, symbols: true });
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
    expect(/[^a-zA-Z0-9]/.test(pw)).toBe(true);
  });
});

describe("generateBatch", () => {
  it("generates the requested count", () => {
    const batch = generateBatch(5, { length: 12, upper: true, lower: true, digits: true, symbols: false });
    expect(batch).toHaveLength(5);
    batch.forEach((pw) => expect(pw).toHaveLength(12));
  });

  it("produces unique passwords", () => {
    const batch = generateBatch(20, { length: 16, upper: true, lower: true, digits: true, symbols: true });
    expect(new Set(batch).size).toBe(20);
  });
});

describe("generatePIN", () => {
  it("generates a PIN of the requested length", () => {
    expect(generatePIN(4)).toHaveLength(4);
    expect(generatePIN(6)).toHaveLength(6);
    expect(generatePIN(8)).toHaveLength(8);
  });

  it("contains only digits", () => {
    const pin = generatePIN(10);
    expect(/^\d+$/.test(pin)).toBe(true);
  });

  it("returns empty for zero length", () => {
    expect(generatePIN(0)).toBe("");
  });

  it("produces different PINs on each call", () => {
    const a = generatePIN(6);
    const b = generatePIN(6);
    expect(a).not.toBe(b);
  });
});

describe("excludeSimilar", () => {
  it("excludes similar characters from custom pool when enabled", () => {
    const pw = generatePassword({
      length: 200,
      upper: false,
      lower: false,
      digits: false,
      symbols: false,
      custom: "abc0O1lI|",
      excludeSimilar: true,
    });
    expect(pw).not.toMatch(/[0O1lI|]/);
    expect(pw).toMatch(/^[abc]+$/);
  });

  it("includes similar characters from custom pool when disabled", () => {
    const pw = generatePassword({
      length: 200,
      upper: false,
      lower: false,
      digits: false,
      symbols: false,
      custom: "abc0O1lI|",
      excludeSimilar: false,
    });
    expect(pw).toMatch(/0/);
    expect(pw).toMatch(/[O]/);
  });
});
