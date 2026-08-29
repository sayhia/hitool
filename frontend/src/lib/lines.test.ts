import { describe, expect, it } from "vitest";
import {
  applyStep,
  countWords,
  naturalCompare,
  runPipeline,
  splitLines,
  stats,
  type Step,
} from "./lines";

const run = (lines: string[], step: Step, seed = 1) => applyStep(lines, step, seed);

describe("splitLines", () => {
  it("treats a final newline as a terminator", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\nb")).toEqual(["a", "b"]);
  });

  it("keeps a genuinely empty line in the middle", () => {
    expect(splitLines("a\n\nb")).toEqual(["a", "", "b"]);
  });

  it("normalises CRLF", () => {
    expect(splitLines("a\r\nb")).toEqual(["a", "b"]);
  });

  it("handles empty input", () => {
    expect(splitLines("")).toEqual([]);
  });
});

describe("trimming and emptiness", () => {
  it("trims each line", () => {
    expect(run(["  a  ", "\tb"], { kind: "trim" })).toEqual(["a", "b"]);
  });

  it("drops blank and whitespace-only lines", () => {
    expect(run(["a", "", "  ", "b"], { kind: "removeEmpty" })).toEqual(["a", "b"]);
  });

  it("collapses runs of spaces and tabs, not single separators", () => {
    expect(run(["a    b\t\tc  d"], { kind: "mergeSpaces" })).toEqual(["a b c d"]);
    expect(run(["a b c"], { kind: "mergeSpaces" })).toEqual(["a b c"]);
  });
});

describe("case and script spacing", () => {
  it("recapitalizes line starts and sentence enders", () => {
    expect(run(["hello world. how are you", "SECOND LINE"], { kind: "sentence" })).toEqual([
      "Hello world. How are you",
      "Second line",
    ]);
  });

  it("leaves sentence case alone when already fine", () => {
    expect(run(["Hello world."], { kind: "sentence" })).toEqual(["Hello world."]);
  });

  it("spaces CJK against latin and digits, pangu-style", () => {
    expect(run(["HiTool是一个工具箱，版本v3"], { kind: "pangu" })).toEqual([
      "HiTool 是一个工具箱，版本 v3",
    ]);
  });

  it("keeps existing spaces intact (idempotent)", () => {
    expect(run(["HiTool 是工具"], { kind: "pangu" })).toEqual(["HiTool 是工具"]);
  });

  it("chains with other steps through the pipeline", () => {
    const out = runPipeline("b  a\nb\na  b", [{ kind: "mergeSpaces" }, { kind: "sort" }]);
    expect(out).toEqual(["a b", "b", "b a"]);
  });
});

describe("dedupe", () => {
  it("keeps the first of each line", () => {
    expect(run(["a", "b", "a", "c", "b"], { kind: "dedupe" })).toEqual(["a", "b", "c"]);
  });

  it("can ignore case", () => {
    expect(run(["A", "a"], { kind: "dedupe" })).toEqual(["A", "a"]);
    expect(run(["A", "a"], { kind: "dedupe", ignoreCase: true })).toEqual(["A"]);
  });

  it("only collapses neighbours in adjacent mode", () => {
    expect(run(["a", "a", "b", "a"], { kind: "dedupeAdjacent" })).toEqual(["a", "b", "a"]);
  });

  it("keeps only the lines that repeat, once each", () => {
    // The inverse question: which lines collide?
    expect(run(["a", "b", "a", "c", "b", "b"], { kind: "keepDuplicates" })).toEqual(["a", "b"]);
  });

  it("returns nothing when nothing repeats", () => {
    expect(run(["a", "b"], { kind: "keepDuplicates" })).toEqual([]);
  });
});

describe("sorting", () => {
  it("sorts ascending and descending", () => {
    expect(run(["c", "a", "b"], { kind: "sort" })).toEqual(["a", "b", "c"]);
    expect(run(["c", "a", "b"], { kind: "sort", desc: true })).toEqual(["c", "b", "a"]);
  });

  it("sorts digit runs as numbers in natural mode", () => {
    // Plain string order puts item10 before item9, which reads as a bug.
    expect(run(["item9", "item10", "item1"], { kind: "sort" })).toEqual([
      "item1",
      "item10",
      "item9",
    ]);
    expect(run(["item9", "item10", "item1"], { kind: "sortNatural" })).toEqual([
      "item1",
      "item9",
      "item10",
    ]);
  });

  it("sorts by length, breaking ties alphabetically", () => {
    expect(run(["ccc", "a", "bb", "aa"], { kind: "sortLength" })).toEqual(["a", "aa", "bb", "ccc"]);
  });

  it("reverses without sorting", () => {
    expect(run(["a", "c", "b"], { kind: "reverse" })).toEqual(["b", "c", "a"]);
  });

  it("shuffles deterministically for a given seed", () => {
    const lines = ["a", "b", "c", "d", "e", "f"];
    const once = run(lines, { kind: "shuffle" }, 7);
    expect(run(lines, { kind: "shuffle" }, 7)).toEqual(once);
    expect(run(lines, { kind: "shuffle" }, 8)).not.toEqual(once);
    expect([...once].sort()).toEqual([...lines].sort());
  });

  it("uppercases and lowercases whole lines", () => {
    expect(run(["Hello 中文"], { kind: "upper" })).toEqual(["HELLO 中文"]);
    expect(run(["Hello 中文"], { kind: "lower" })).toEqual(["hello 中文"]);
  });

  it("title-cases the first letter of each word only", () => {
    expect(run(["hello world wide"], { kind: "titleCase" })).toEqual(["Hello World Wide"]);
    // Interior casing is preserved, so brand-style words survive.
    expect(run(["iPhone os"], { kind: "titleCase" })).toEqual(["IPhone Os"]);
  });

  it("does not mutate the input", () => {
    const lines = ["c", "a"];
    run(lines, { kind: "sort" });
    expect(lines).toEqual(["c", "a"]);
  });
});

describe("filtering", () => {
  it("keeps or drops by substring", () => {
    const lines = ["apple", "banana", "cherry"];
    expect(run(lines, { kind: "keepMatching", pattern: "an" })).toEqual(["banana"]);
    expect(run(lines, { kind: "dropMatching", pattern: "an" })).toEqual(["apple", "cherry"]);
  });

  it("can ignore case", () => {
    expect(run(["Apple"], { kind: "keepMatching", pattern: "apple" })).toEqual([]);
    expect(run(["Apple"], { kind: "keepMatching", pattern: "apple", ignoreCase: true })).toEqual([
      "Apple",
    ]);
  });

  it("filters by regex when asked", () => {
    const lines = ["a1", "b2", "cc"];
    expect(run(lines, { kind: "keepMatching", pattern: "\\d$", regex: true })).toEqual(["a1", "b2"]);
  });

  it("matches nothing rather than emptying the document on a broken pattern", () => {
    // A half-typed pattern is a pattern being typed.
    expect(run(["a", "b"], { kind: "keepMatching", pattern: "[", regex: true })).toEqual([]);
    expect(run(["a", "b"], { kind: "dropMatching", pattern: "[", regex: true })).toEqual(["a", "b"]);
  });

  it("keeps everything when the pattern is empty", () => {
    expect(run(["a", "b"], { kind: "keepMatching", pattern: "" })).toEqual(["a", "b"]);
  });
});

describe("numbering and affixes", () => {
  it("numbers from one by default", () => {
    expect(run(["a", "b"], { kind: "number" })).toEqual(["1. a", "2. b"]);
  });

  it("numbers from a given start", () => {
    expect(run(["a", "b"], { kind: "number", start: 10 })).toEqual(["10. a", "11. b"]);
  });

  it("pads so the text stays in one column", () => {
    const out = run(Array.from({ length: 10 }, (_, i) => `x${i}`), { kind: "number" });
    expect(out[0]).toBe(" 1. x0");
    expect(out[9]).toBe("10. x9");
  });

  it("adds a prefix and a suffix", () => {
    expect(run(["a"], { kind: "affix", prefix: '"', suffix: '",' })).toEqual(['"a",']);
  });
});

describe("slice", () => {
  it("takes an inclusive 1-based range", () => {
    const lines = ["a", "b", "c", "d"];
    expect(run(lines, { kind: "slice", from: 2, to: 3 })).toEqual(["b", "c"]);
  });

  it("runs to the end when no upper bound is given", () => {
    expect(run(["a", "b", "c"], { kind: "slice", from: 2 })).toEqual(["b", "c"]);
  });

  it("clamps a bound outside the document", () => {
    expect(run(["a", "b"], { kind: "slice", from: 0, to: 99 })).toEqual(["a", "b"]);
  });
});

describe("runPipeline", () => {
  it("applies the steps in order", () => {
    const text = "  b  \n a \n\n a \n c ";
    const out = runPipeline(text, [
      { kind: "trim" },
      { kind: "removeEmpty" },
      { kind: "dedupe" },
      { kind: "sort" },
    ]);
    expect(out).toEqual(["a", "b", "c"]);
  });

  it("order matters, and the pipeline respects it", () => {
    const text = "b\na\nb";
    const dedupeFirst = runPipeline(text, [{ kind: "dedupe" }, { kind: "number" }]);
    const numberFirst = runPipeline(text, [{ kind: "number" }, { kind: "dedupe" }]);
    expect(dedupeFirst).toEqual(["1. b", "2. a"]);
    // Numbering first makes every line unique, so dedupe has nothing to do.
    expect(numberFirst).toEqual(["1. b", "2. a", "3. b"]);
  });

  it("returns the lines unchanged for an empty pipeline", () => {
    expect(runPipeline("a\nb", [])).toEqual(["a", "b"]);
  });

  it("ignores an unknown step rather than throwing", () => {
    expect(runPipeline("a", [{ kind: "nope" as never }])).toEqual(["a"]);
  });
});

describe("naturalCompare", () => {
  it("orders digit runs numerically", () => {
    expect(naturalCompare("a2", "a10")).toBeLessThan(0);
    expect(naturalCompare("a10", "a2")).toBeGreaterThan(0);
    expect(naturalCompare("a2", "a2")).toBe(0);
  });

  it("falls back to text where there are no digits", () => {
    expect(naturalCompare("apple", "banana")).toBeLessThan(0);
  });

  it("puts a shorter prefix first", () => {
    expect(naturalCompare("file", "file1")).toBeLessThan(0);
  });
});

describe("countWords", () => {
  it("counts space-separated words", () => {
    expect(countWords("one two three")).toBe(3);
    expect(countWords("  spaced   out  ")).toBe(2);
    expect(countWords("")).toBe(0);
  });

  it("counts each CJK character as a word", () => {
    // Counting by whitespace would call a whole Chinese sentence one word.
    expect(countWords("你好世界")).toBe(4);
    expect(countWords("hello 世界")).toBe(3);
  });
});

describe("stats", () => {
  it("counts lines, uniques and duplicates", () => {
    const s = stats(["a", "b", "a", ""]);
    expect(s.lines).toBe(4);
    expect(s.nonEmpty).toBe(3);
    expect(s.unique).toBe(3);
    expect(s.duplicates).toBe(1);
  });

  it("counts characters by code point, not UTF-16 unit", () => {
    // An emoji is one character to a reader and two to `.length`.
    expect(stats(["🙂"]).chars).toBe(1);
    expect(stats(["ab"]).chars).toBe(2);
  });

  it("reports the longest line", () => {
    expect(stats(["a", "abcd", "ab"]).longest).toBe(4);
  });

  it("handles an empty document", () => {
    expect(stats([])).toMatchObject({ lines: 0, unique: 0, duplicates: 0, longest: 0 });
  });
});
