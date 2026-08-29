import { describe, expect, it } from "vitest";
import { parsePool, pickWinners, uniqueNames } from "./raffle";

/** Deterministic rng for repeatable draws. */
const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("raffle", () => {
  it("parses one name per line, trimming and dropping blanks", () => {
    expect(parsePool("  a \n\nb\r\n  \nc")).toEqual(["a", "b", "c"]);
  });

  it("deduplicates keeping first occurrences", () => {
    expect(uniqueNames(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });

  it("returns exactly the requested number of distinct winners", () => {
    const pool = ["a", "b", "c", "d", "e"];
    const winners = pickWinners(pool, 3, { rng: seq([0.1, 0.5, 0.9]) });
    expect(winners).toHaveLength(3);
    expect(new Set(winners).size).toBe(3);
    for (const w of winners) expect(pool).toContain(w);
  });

  it("caps the draw at the pool size", () => {
    expect(pickWinners(["a", "b"], 5, { rng: seq([0.2, 0.8]) })).toHaveLength(2);
  });

  it("does not mutate the caller's pool", () => {
    const pool = ["a", "b", "c"];
    pickWinners(pool, 3, { rng: seq([0.9, 0.9, 0.9]) });
    expect(pool).toEqual(["a", "b", "c"]);
  });

  it("keeps duplicate tickets when unique is off", () => {
    const winners = pickWinners(["a", "a", "b"], 3, { unique: false, rng: seq([0, 0, 0]) });
    expect(winners).toHaveLength(3);
    expect(winners.filter((w) => w === "a")).toHaveLength(2);
  });

  it("handles an empty pool and zero count", () => {
    expect(pickWinners([], 3)).toEqual([]);
    expect(pickWinners(["a"], 0)).toEqual([]);
  });

  it("stays uniform-ish over many draws", () => {
    const pool = ["a", "b"];
    let aFirst = 0;
    for (let i = 0; i < 2000; i++) {
      const [w] = pickWinners(pool, 1, { rng: () => Math.random() });
      if (w === "a") aFirst++;
    }
    expect(aFirst).toBeGreaterThan(800);
    expect(aFirst).toBeLessThan(1200);
  });
});
