import { describe, expect, it } from "vitest";
import { replaceAll } from "./regexReplace";

const run = (s: string, p: string, f: string, r: string) => replaceAll(s, new RegExp(p, f), r);

/** The output must always equal what the engine itself would produce. */
function agreesWithEngine(subject: string, pattern: string, flags: string, replacement: string) {
  const mine = replaceAll(subject, new RegExp(pattern, flags), replacement).output;
  const theirs = subject.replace(new RegExp(pattern, flags), replacement);
  expect(mine, `${pattern}/${flags} on ${JSON.stringify(subject)}`).toBe(theirs);
}

describe("replaceAll — agreement with the engine", () => {
  const cases: [string, string, string, string][] = [
    ["hello world", "o", "g", "0"],
    ["hello world", "o", "", "0"],
    ["2026-08-04", "(\\d{4})-(\\d{2})-(\\d{2})", "g", "$3/$2/$1"],
    ["a1b2c3", "\\d", "g", "[$&]"],
    ["Ada and Bo", "(?<who>A\\w+)", "g", "<$<who>>"],
    ["price: 10", "\\d+", "g", "$$$&"],
    ["aaa", "a*", "g", "-"],
    ["abc", "", "g", "."],
    ["  padded  ", "^\\s+|\\s+$", "g", ""],
    ["CamelCaseWord", "([a-z])([A-Z])", "g", "$1_$2"],
    ["no match here", "zzz", "g", "x"],
    ["", "a", "g", "b"],
    ["mixed\nlines\nhere", "^", "gm", "> "],
    ["tabs\tand\tspaces", "\\s+", "g", " "],
  ];

  for (const [subject, pattern, flags, replacement] of cases) {
    it(`/${pattern}/${flags} → ${JSON.stringify(replacement)}`, () => {
      agreesWithEngine(subject, pattern, flags, replacement);
    });
  }
});

describe("replaceAll — agreement across a cross-product", () => {
  // Hand-picked cases only cover what I thought to try. Crossing a corpus of
  // awkward subjects with awkward patterns is what actually found the /^/gm
  // double-replacement.
  const subjects = [
    "",
    "a",
    "aaa",
    "abc abc",
    "one\ntwo\nthree",
    "\n\n",
    "  spaced  out  ",
    "2026-08-04T12:30:00Z",
    "键=值; key=value",
    "a1b22c333",
    "()[]{}",
  ];
  const patterns: [string, string][] = [
    ["a", "g"],
    ["a*", "g"],
    ["", "g"],
    ["^", "gm"],
    ["$", "gm"],
    ["\\b", "g"],
    ["\\s+", "g"],
    ["(\\w)(\\d+)", "g"],
    ["[^a-z]", "gi"],
    [".", "gs"],
    ["(?<d>\\d)", "g"],
    ["z", "g"],
    ["a", ""],
  ];
  const replacements = ["", "-", "[$&]", "<$1>", "$$"];

  it("matches String.replace on every combination", () => {
    let checked = 0;
    for (const subject of subjects) {
      for (const [pattern, flags] of patterns) {
        for (const replacement of replacements) {
          // `<$1>` on a pattern with no group is legal but uninteresting;
          // the engine leaves `$1` literal and so must we, so keep it in.
          agreesWithEngine(subject, pattern, flags, replacement);
          checked++;
        }
      }
    }
    expect(checked).toBe(subjects.length * patterns.length * replacements.length);
  });

  it("segments reassemble into the output for every combination", () => {
    for (const subject of subjects) {
      for (const [pattern, flags] of patterns) {
        const r = replaceAll(subject, new RegExp(pattern, flags), "[$&]");
        expect(r.segments.map((s) => s.text).join(""), `${pattern}/${flags}`).toBe(r.output);
      }
    }
  });
});

describe("replaceAll — counting", () => {
  it("counts every replacement when global", () => {
    expect(run("a-a-a", "a", "g", "b").count).toBe(3);
  });

  it("stops after one without the global flag", () => {
    const r = run("a-a-a", "a", "", "b");
    expect(r.count).toBe(1);
    expect(r.output).toBe("b-a-a");
  });

  it("reports zero when nothing matches", () => {
    const r = run("abc", "z", "g", "x");
    expect(r.count).toBe(0);
    expect(r.output).toBe("abc");
  });
});

describe("replaceAll — segments", () => {
  it("marks only the replaced runs", () => {
    const r = run("a-b-a", "a", "g", "X");
    expect(r.segments).toEqual([
      { text: "X", hit: true },
      { text: "-b-", hit: false },
      { text: "X", hit: true },
    ]);
  });

  it("segments always reassemble into the output", () => {
    for (const [s, p, f, rep] of [
      ["hello world", "o", "g", "0"],
      ["2026-08-04", "-", "g", ""],
      ["aaa", "a*", "g", "-"],
      ["abc", "b", "", "Z"],
      ["xyz", "q", "g", "Q"],
    ] as const) {
      const r = run(s, p, f, rep);
      expect(r.segments.map((x) => x.text).join(""), `${p}/${f}`).toBe(r.output);
    }
  });

  it("merges adjacent runs of the same kind", () => {
    // Every character matches, so a naive implementation emits one span each.
    const r = run("aaaa", ".", "g", "x");
    expect(r.segments).toEqual([{ text: "xxxx", hit: true }]);
  });

  it("emits nothing for an empty subject", () => {
    expect(run("", "a", "g", "b").segments).toEqual([]);
  });
});

describe("replaceAll — degenerate patterns", () => {
  it("terminates on a zero-length global match", () => {
    const r = run("abc", "(?:)", "g", "-");
    expect(r.output).toBe("-a-b-c-");
  });

  it("terminates on a pattern that can match empty", () => {
    const r = run("aaa", "a*", "g", "-");
    expect(r.count).toBeLessThan(20);
  });

  it("honours the replacement limit rather than running away", () => {
    const long = "a".repeat(500);
    const r = replaceAll(long, /a/g, "b", 10);
    expect(r.count).toBe(10);
    // Whatever was not reached must still be carried into the output.
    expect(r.output.length).toBe(500);
  });

  it("passes a null pattern through untouched", () => {
    const r = replaceAll("unchanged", null, "x");
    expect(r.output).toBe("unchanged");
    expect(r.count).toBe(0);
  });
});
