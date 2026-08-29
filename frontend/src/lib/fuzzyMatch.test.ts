import { describe, expect, it } from "vitest";
import { fuzzyMatch, splitHighlight } from "./fuzzyMatch";

describe("fuzzyMatch", () => {
  it("returns a neutral hit for an empty query", () => {
    expect(fuzzyMatch("", "anything")).toEqual({ score: 0, ranges: [] });
    expect(fuzzyMatch("   ", "anything")).toEqual({ score: 0, ranges: [] });
  });

  it("prefers contiguous matches and ranks earlier ones higher", () => {
    const early = fuzzyMatch("text", "text-stats");
    const late = fuzzyMatch("stats", "text-stats");
    expect(early!.score).toBeGreaterThan(late!.score);
    expect(early!.ranges).toEqual([[0, 4]]);
  });

  it("is case-insensitive", () => {
    expect(fuzzyMatch("BASE", "Base64 Tool")).not.toBeNull();
  });

  it("matches CJK titles", () => {
    const hit = fuzzyMatch("命名", "命名风格转换");
    expect(hit!.ranges).toEqual([[0, 2]]);
  });

  it("falls back to an ordered subsequence", () => {
    const hit = fuzzyMatch("tst", "text-stats");
    expect(hit).not.toBeNull();
    expect(hit!.score).toBeLessThan(500);
  });

  it("rejects out-of-order characters", () => {
    expect(fuzzyMatch("stats-text", "text-stats")).toBeNull();
  });

  it("penalizes sprawling subsequences", () => {
    const tight = fuzzyMatch("ts", "text-stats")!;
    const loose = fuzzyMatch("ts", "taxes-something-very-long")!;
    expect(tight.score).toBeGreaterThanOrEqual(loose.score);
  });
});

describe("splitHighlight", () => {
  it("returns plain text when nothing matched", () => {
    expect(splitHighlight("abc", [])).toEqual([{ text: "abc", hit: false }]);
  });

  it("splits around matched ranges", () => {
    expect(splitHighlight("text-stats", [[0, 4]])).toEqual([
      { text: "text", hit: true },
      { text: "-stats", hit: false },
    ]);
  });

  it("handles multiple ranges", () => {
    expect(splitHighlight("abcdef", [[0, 1], [3, 4]])).toEqual([
      { text: "a", hit: true },
      { text: "bc", hit: false },
      { text: "d", hit: true },
      { text: "ef", hit: false },
    ]);
  });
});
