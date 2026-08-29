import { describe, expect, it } from "vitest";
import {
  diffLines,
  diffWords,
  rowPieces,
  tokenize,
  toHtml,
  toUnified,
  type DiffOptions,
  type InlineSeg,
} from "./diff";

const shape = (a: string, b: string, o = {}) =>
  diffLines(a, b, o).rows.map((r) => `${r.kind}:${r.text}`);

describe("diffLines", () => {
  it("marks identical input as all unchanged", () => {
    const r = diffLines("a\nb\nc", "a\nb\nc");
    expect(r.added).toBe(0);
    expect(r.removed).toBe(0);
    expect(r.rows.every((x) => x.kind === "same")).toBe(true);
  });

  it("detects a pure insertion", () => {
    const r = diffLines("a\nc", "a\nb\nc");
    expect(r.added).toBe(1);
    expect(r.removed).toBe(0);
    expect(shape("a\nc", "a\nb\nc")).toEqual(["same:a", "add:b", "same:c"]);
  });

  it("detects a pure deletion", () => {
    const r = diffLines("a\nb\nc", "a\nc");
    expect(r.added).toBe(0);
    expect(r.removed).toBe(1);
  });

  it("represents a change as a delete plus an add", () => {
    const r = diffLines("a\nb\nc", "a\nB\nc");
    expect(r.added).toBe(1);
    expect(r.removed).toBe(1);
  });

  it("numbers lines per side, leaving the missing side null", () => {
    const r = diffLines("a\nc", "a\nb\nc");
    const add = r.rows.find((x) => x.kind === "add")!;
    expect(add.leftNo).toBeNull();
    expect(add.rightNo).toBe(2);
    const same = r.rows[0];
    expect(same.leftNo).toBe(1);
    expect(same.rightNo).toBe(1);
  });

  it("handles one side being empty", () => {
    expect(diffLines("", "a\nb").added).toBe(2);
    expect(diffLines("a\nb", "").removed).toBe(2);
    expect(diffLines("", "").rows).toEqual([]);
  });

  it("finds the longest common subsequence rather than aligning naively", () => {
    // A naive line-by-line walk would call all four lines changed.
    const r = diffLines("x\na\nb\nc", "a\nb\nc\ny");
    expect(r.removed).toBe(1);
    expect(r.added).toBe(1);
    expect(r.rows.filter((x) => x.kind === "same")).toHaveLength(3);
  });

  it("respects ignoreCase", () => {
    expect(diffLines("Hello", "hello").removed).toBe(1);
    expect(diffLines("Hello", "hello", { ignoreCase: true }).removed).toBe(0);
  });

  it("respects ignoreWhitespace", () => {
    expect(diffLines("a  b", "a b").removed).toBe(1);
    expect(diffLines("  a b  ", "a b", { ignoreWhitespace: true }).removed).toBe(0);
  });

  it("shows the original text even when comparison is normalised", () => {
    const r = diffLines("  A  ", "a", { ignoreCase: true, ignoreWhitespace: true });
    expect(r.rows[0].kind).toBe("same");
    // The left-hand original is preserved, not the normalised form.
    expect(r.rows[0].text).toBe("  A  ");
  });

  it("collapses long unchanged runs when a context is given", () => {
    const a = ["head", ...Array(30).fill("same"), "tail"].join("\n");
    const b = ["HEAD", ...Array(30).fill("same"), "tail"].join("\n");
    const full = diffLines(a, b);
    const ctx = diffLines(a, b, { context: 2 });
    expect(ctx.rows.length).toBeLessThan(full.rows.length);

    const marker = ctx.rows.find((r) => r.skipped);
    expect(marker).toBeTruthy();
    // The marker has to account for every row it stands in for, or the
    // collapsed view quietly under-reports how much was hidden.
    const elided = ctx.rows.reduce((n, r) => n + (r.skipped ?? 0), 0);
    const shown = ctx.rows.filter((r) => !r.skipped).length;
    expect(shown + elided).toBe(full.rows.length);
  });

  it("keeps a collapsed marker out of the copyable text", () => {
    const a = ["x", ...Array(20).fill("s")].join("\n");
    const b = ["y", ...Array(20).fill("s")].join("\n");
    const rows = diffLines(a, b, { context: 1 }).rows;
    // Markers carry no text; a consumer filtering on `skipped` must be left
    // with only real lines.
    for (const r of rows.filter((x) => x.skipped)) {
      expect(r.text).toBe("");
      expect(r.leftNo).toBeNull();
      expect(r.rightNo).toBeNull();
    }
  });

  it("keeps counts accurate even when rows are collapsed", () => {
    const a = ["x", ...Array(20).fill("s")].join("\n");
    const b = ["y", ...Array(20).fill("s")].join("\n");
    const ctx = diffLines(a, b, { context: 1 });
    expect(ctx.added).toBe(1);
    expect(ctx.removed).toBe(1);
  });

  it("flags truncation instead of hanging on a huge input", () => {
    const big = Array(4100).fill("line").join("\n");
    const r = diffLines(big, big);
    expect(r.truncated).toBe(true);
    expect(r.rows.length).toBeLessThanOrEqual(4000);
  });

  it("ignoreDigits treats lines differing only in numbers as unchanged", () => {
    const a = "id=123 total 45.6\nsame line";
    const b = "id=789 total 99.1\nsame line";
    expect(diffLines(a, b).added).toBe(1);
    const r = diffLines(a, b, { ignoreDigits: true });
    expect(r.added).toBe(0);
    expect(r.removed).toBe(0);
  });

  it("ignoreDigits still reports genuine non-digit changes", () => {
    const a = "id=1 name=foo";
    const b = "id=2 name=bar";
    const r = diffLines(a, b, { ignoreDigits: true });
    expect(r.added + r.removed).toBeGreaterThan(0);
  });
});

describe("tokenize", () => {
  it("keeps latin words and numbers whole", () => {
    expect(tokenize("let x1 = 42")).toEqual(["let", " ", "x1", " ", "=", " ", "42"]);
  });

  it("splits CJK one character at a time", () => {
    // No separators to group on, and a one-character edit should not repaint
    // the whole sentence.
    expect(tokenize("你好世界")).toEqual(["你", "好", "世", "界"]);
  });

  it("does not swallow CJK into an adjacent latin word", () => {
    expect(tokenize("Vue3中文")).toEqual(["Vue3", "中", "文"]);
    expect(tokenize("中文Vue3")).toEqual(["中", "文", "Vue3"]);
  });

  it("gives each punctuation mark its own token", () => {
    expect(tokenize("a,b")).toEqual(["a", ",", "b"]);
    expect(tokenize("...")).toEqual([".", ".", "."]);
  });

  it("groups a whitespace run but keeps it separate from words", () => {
    expect(tokenize("a  \t b")).toEqual(["a", "  \t ", "b"]);
  });

  it("keeps astral characters whole", () => {
    // Iterating UTF-16 units would cut the surrogate pair in half.
    expect(tokenize("hi 🙂!")).toEqual(["hi", " ", "🙂", "!"]);
  });

  it("keeps a combining mark attached to its base letter", () => {
    expect(tokenize("café")).toEqual(["café"]);
  });

  it("always reassembles into the original string", () => {
    for (const s of [
      "",
      "a",
      "   ",
      "hello world",
      "你好，世界！",
      "mixed 中英 text 42",
      "a\tb\nc",
      "🙂🙃",
      "const fn = (a, b) => a + b;",
      "<div class=\"x\">文本</div>",
    ]) {
      expect(tokenize(s).join(""), JSON.stringify(s)).toBe(s);
    }
  });
});

/** Rebuild each side from the segments; both must match the original line. */
function sides(parts: InlineSeg[]): [string, string] {
  let l = "";
  let r = "";
  for (const p of parts) {
    if (p.kind !== "add") l += p.text;
    if (p.kind !== "del") r += p.kind === "same" ? (p.other ?? p.text) : p.text;
  }
  return [l, r];
}

describe("diffWords", () => {
  it("marks only the word that changed", () => {
    const parts = diffWords("the cat sat", "the dog sat")!;
    expect(parts.map((p) => `${p.kind}:${p.text}`)).toEqual([
      "same:the ",
      "del:cat",
      "add:dog",
      "same: sat",
    ]);
  });

  it("marks only the character that changed in CJK", () => {
    const parts = diffWords("今天天气很好", "今天天气很差")!;
    expect(parts.map((p) => `${p.kind}:${p.text}`)).toEqual([
      "same:今天天气很",
      "del:好",
      "add:差",
    ]);
  });

  it("declines when the two lines have nothing in common", () => {
    // Highlighting every token says less than the row tint already does.
    expect(diffWords("import foo from 'bar'", "const x = 1")).toBeNull();
    expect(diffWords("alpha", "beta")).toBeNull();
  });

  it("does not count shared whitespace as similarity", () => {
    // Two unrelated prose lines share their spaces; if those counted, the
    // pair would clear the threshold on punctuation alone.
    expect(diffWords("one two three four", "five six seven eight")).toBeNull();
  });

  it("keeps a pair that only shares punctuation", () => {
    const parts = diffWords("a=1", "b=2");
    expect(parts).not.toBeNull();
    expect(parts!.some((p) => p.kind === "same" && p.text === "=")).toBe(true);
  });

  it("declines when either side is empty", () => {
    expect(diffWords("", "abc")).toBeNull();
    expect(diffWords("abc", "")).toBeNull();
  });

  it("declines rather than tabling a pathologically long line", () => {
    const long = Array(900).fill("x").join(" ");
    expect(diffWords(long, long + " y")).toBeNull();
  });

  it("carries both sides when ignoreCase hides a difference", () => {
    const parts = diffWords("Hello world", "hello World!", { ignoreCase: true })!;
    // The rows still render their own casing even though the tokens matched.
    expect(sides(parts)).toEqual(["Hello world", "hello World!"]);
  });

  it("omits `other` when the two sides are identical", () => {
    const parts = diffWords("the cat sat", "the dog sat")!;
    expect(parts.every((p) => p.other === undefined)).toBe(true);
  });

  it("treats differing whitespace as equal under ignoreWhitespace", () => {
    const parts = diffWords("a\tb c", "a  b d", { ignoreWhitespace: true })!;
    expect(sides(parts)).toEqual(["a\tb c", "a  b d"]);
    expect(parts.filter((p) => p.kind !== "same").map((p) => p.text)).toEqual(["c", "d"]);
  });

  it("reassembles both sides for every combination of inputs and options", () => {
    // The hand-written cases above only cover what I thought to try; crossing
    // awkward pairs with every option combination is what proves the `other`
    // bookkeeping never drifts from the text it stands for.
    const lines = [
      "",
      "a",
      "the cat sat on the mat",
      "The Cat SAT on the mat",
      "  the cat  sat  ",
      "今天天气很好",
      "今天天气很差劲",
      "mixed 中英 text 42",
      "const a = fn(x, y);",
      "const a = fn(x, z);",
      "a=1",
      "🙂 ok",
      "\t\t",
      "one, two, three",
    ];
    const opts: DiffOptions[] = [
      {},
      { ignoreCase: true },
      { ignoreWhitespace: true },
      { ignoreCase: true, ignoreWhitespace: true },
    ];

    let checked = 0;
    for (const a of lines) {
      for (const b of lines) {
        for (const o of opts) {
          const parts = diffWords(a, b, o);
          checked++;
          if (!parts) continue;
          expect(sides(parts), `${JSON.stringify([a, b, o])}`).toEqual([a, b]);
          // Adjacent segments of one kind must have been merged, or the DOM
          // ends up with a span per character.
          for (let i = 1; i < parts.length; i++) {
            expect(parts[i].kind, `${JSON.stringify([a, b])}`).not.toBe(parts[i - 1].kind);
          }
        }
      }
    }
    expect(checked).toBe(lines.length * lines.length * opts.length);
  });
});

describe("diffLines — inline pairing", () => {
  const opts = { word: true } as const;

  it("attaches segments to a del/add pair", () => {
    const rows = diffLines("the cat sat", "the dog sat", opts).rows;
    expect(rows.map((r) => r.kind)).toEqual(["del", "add"]);
    expect(rows[0].parts).toBeTruthy();
    // Both rows read the same breakdown, filtered by their own kind.
    expect(rows[1].parts).toBe(rows[0].parts);
  });

  it("adds nothing when the word pass is off", () => {
    const rows = diffLines("the cat sat", "the dog sat").rows;
    expect(rows.every((r) => r.parts === undefined)).toBe(true);
  });

  it("leaves a pure insertion unpaired", () => {
    const rows = diffLines("a\nc", "a\nb\nc", opts).rows;
    expect(rows.find((r) => r.kind === "add")!.parts).toBeUndefined();
  });

  it("pairs a multi-line edit positionally", () => {
    const rows = diffLines("cat one\ncat two", "dog one\ndog two", opts).rows;
    const del = rows.filter((r) => r.kind === "del");
    const add = rows.filter((r) => r.kind === "add");
    expect(del[0].parts).toBe(add[0].parts);
    expect(del[1].parts).toBe(add[1].parts);
    expect(del[0].parts).not.toBe(del[1].parts);
  });

  it("leaves the surplus of an uneven run unpaired", () => {
    // Two lines replaced by three: the first two pair up, the third is a
    // genuine insertion and keeps the plain tint.
    const rows = diffLines("cat one\ncat two", "dog one\ndog two\ndog three", opts).rows;
    const add = rows.filter((r) => r.kind === "add");
    expect(add).toHaveLength(3);
    expect(add[2].parts).toBeUndefined();
  });

  it("leaves an unrelated del/add pair unpaired", () => {
    const rows = diffLines("head\nimport foo from 'bar'", "head\nconst x = 1", opts).rows;
    expect(rows.find((r) => r.kind === "del")!.parts).toBeUndefined();
  });

  it("never pairs across an unchanged line", () => {
    const rows = diffLines("cat one\nkept\ncat two", "dog one\nkept\ndog two", opts).rows;
    expect(rows.map((r) => r.kind)).toEqual(["del", "add", "same", "del", "add"]);
    const parts = rows.filter((r) => r.parts).map((r) => r.parts);
    // Two independent pairs, not one run spanning the unchanged row.
    expect(parts).toHaveLength(4);
    expect(new Set(parts).size).toBe(2);
  });

  it("survives a document whose every line changed", () => {
    const a = Array.from({ length: 40 }, (_, i) => `line ${i} old`).join("\n");
    const b = Array.from({ length: 40 }, (_, i) => `line ${i} new`).join("\n");
    const rows = diffLines(a, b, opts).rows;
    expect(rows.filter((r) => r.parts).length).toBe(80);
  });
});

describe("rowPieces", () => {
  const parts = diffWords("the cat sat", "the dog sat")!;

  it("gives a deleted row the removed side", () => {
    const r = { kind: "del" as const, leftNo: 1, rightNo: null, text: "the cat sat", parts };
    expect(rowPieces(r).map((p) => (p.changed ? `«${p.text}»` : p.text)).join("")).toBe(
      "the «cat» sat",
    );
  });

  it("gives an added row the inserted side", () => {
    const r = { kind: "add" as const, leftNo: null, rightNo: 1, text: "the dog sat", parts };
    expect(rowPieces(r).map((p) => (p.changed ? `«${p.text}»` : p.text)).join("")).toBe(
      "the «dog» sat",
    );
  });

  it("renders each side's own text when ignoreCase hid a difference", () => {
    const p = diffWords("Hello world here", "hello World there", { ignoreCase: true })!;
    const join = (kind: "del" | "add") =>
      rowPieces({ kind, leftNo: 1, rightNo: 1, text: "", parts: p })
        .map((x) => x.text)
        .join("");
    expect(join("del")).toBe("Hello world here");
    expect(join("add")).toBe("hello World there");
  });

  it("is empty for a row with no breakdown", () => {
    expect(rowPieces({ kind: "same", leftNo: 1, rightNo: 1, text: "x" })).toEqual([]);
  });
});

describe("toUnified", () => {
  it("emits a header and one hunk for a simple change", () => {
    const out = toUnified("a\nb\nc\n", "a\nB\nc\n", {
      leftName: "old.txt",
      rightName: "new.txt",
    });
    expect(out.split("\n")).toEqual([
      "--- old.txt",
      "+++ new.txt",
      "@@ -1,3 +1,3 @@",
      " a",
      "-b",
      "+B",
      " c",
    ]);
  });

  it("returns nothing when the two texts match", () => {
    expect(toUnified("same\ntext", "same\ntext")).toBe("");
  });

  it("counts each side separately in the hunk header", () => {
    const out = toUnified("x\ny", "x\nz\ny");
    expect(out).toContain("@@ -1,2 +1,3 @@");
  });

  it("uses a zero count and the preceding line for a new file", () => {
    // A count of one is written bare, which is what diff(1) emits.
    expect(toUnified("", "hello\n")).toContain("@@ -0,0 +1 @@");
  });

  it("uses a zero count for a deleted file", () => {
    expect(toUnified("hello\n", "")).toContain("@@ -1 +0,0 @@");
  });

  it("marks a file whose last line has no newline", () => {
    const out = toUnified("a\nb", "a\nB");
    expect(out.split("\n")).toEqual([
      "--- a",
      "+++ b",
      "@@ -1,2 +1,2 @@",
      " a",
      "-b",
      "\\ No newline at end of file",
      "+B",
      "\\ No newline at end of file",
    ]);
  });

  it("splits a shared last line when only one side ends without a newline", () => {
    // As a context line it would claim both sides end there unterminated.
    const out = toUnified("a\nb\nc\n", "a\nB\nc");
    expect(out.split("\n").slice(2)).toEqual([
      "@@ -1,3 +1,3 @@",
      " a",
      "-b",
      "-c",
      "+B",
      "+c",
      "\\ No newline at end of file",
    ]);
  });

  it("says nothing when only the trailing newline differs", () => {
    // The screen calls these identical; an export that disagreed with what
    // is on screen would be worse than one that cannot say it.
    expect(toUnified("a\nb\n", "a\nb")).toBe("");
  });

  it("writes every deletion of a block ahead of its insertions", () => {
    const out = toUnified("x\ny\n", "X\nY\n");
    expect(out.split("\n").slice(2)).toEqual(["@@ -1,2 +1,2 @@", "-x", "-y", "+X", "+Y"]);
  });

  it("does not invent a trailing blank line from the final newline", () => {
    // "a\nb\n".split("\n") ends in "", and every text file ends in a newline.
    expect(toUnified("a\nb\n", "a\nB\n").split("\n")).toHaveLength(6);
  });

  it("splits distant changes into separate hunks", () => {
    const a = ["head", ...Array(30).fill("s"), "tail"].join("\n");
    const b = ["HEAD", ...Array(30).fill("s"), "TAIL"].join("\n");
    const hunks = toUnified(a, b).split("\n").filter((l) => l.startsWith("@@"));
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toBe("@@ -1,4 +1,4 @@");
    // 32 lines a side; the tail hunk starts three lines of context earlier.
    expect(hunks[1]).toBe("@@ -29,4 +29,4 @@");
  });

  it("joins changes that are closer together than the context", () => {
    const a = ["x", "s", "s", "y"].join("\n");
    const b = ["X", "s", "s", "Y"].join("\n");
    expect(toUnified(a, b).split("\n").filter((l) => l.startsWith("@@"))).toHaveLength(1);
  });

  it("line numbers stay right when an early hunk is skipped over", () => {
    const a = ["a", ...Array(20).fill("s"), "b", ...Array(20).fill("t"), "c"].join("\n");
    const b = ["A", ...Array(20).fill("s"), "B", ...Array(20).fill("t"), "C"].join("\n");
    const hunks = toUnified(a, b).split("\n").filter((l) => l.startsWith("@@"));
    expect(hunks).toEqual(["@@ -1,4 +1,4 @@", "@@ -19,7 +19,7 @@", "@@ -40,4 +40,4 @@"]);
  });

  it("warns in the preamble when the comparison was not exact", () => {
    const out = toUnified("Hello", "HELLO\nmore", { ignoreCase: true });
    expect(out.startsWith("#")).toBe(true);
    expect(out).toContain("ignore case");
    // The warning has to sit ahead of the header, where patch(1) skips it.
    const lines = out.split("\n");
    expect(lines[1].startsWith("---")).toBe(true);
  });

  it("says nothing extra when the comparison was exact", () => {
    expect(toUnified("a", "b").startsWith("---")).toBe(true);
  });

  it("defaults the file names", () => {
    const out = toUnified("a", "b");
    expect(out).toContain("--- a");
    expect(out).toContain("+++ b");
  });

  it("reproduces the right text on every body line", () => {
    const a = "keep\ndrop\nkeep2";
    const b = "keep\nadd\nkeep2";
    for (const line of toUnified(a, b).split("\n").slice(2)) {
      if (line.startsWith("@@") || line.startsWith("\\")) continue;
      const text = line.slice(1);
      const side = line[0] === "+" ? b : a;
      expect(side.split("\n"), line).toContain(text);
    }
  });
});

describe("toHtml", () => {
  const res = diffLines("the cat sat", "the dog sat", { word: true });

  it("is a standalone document", () => {
    const html = toHtml(res);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>");
    // Nothing may be fetched: the file has to render from a Finder double-click.
    expect(html).not.toMatch(/<(script|link|img)\b/i);
  });

  it("carries the word-level marks the unified format cannot", () => {
    const html = toHtml(res);
    expect(html).toContain("<mark>cat</mark>");
    expect(html).toContain("<mark>dog</mark>");
  });

  it("escapes the content rather than rendering it", () => {
    const bad = diffLines('<script>alert("x")</script>', "<b>&amp;</b>");
    const html = toHtml(bad);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    // A literal ampersand must not turn into an entity of its own.
    expect(html).toContain("&amp;amp;");
  });

  it("escapes the file names in both the title and the heading", () => {
    const html = toHtml(res, { leftName: '<i>a</i>', rightName: "b" });
    expect(html).not.toContain("<i>a</i>");
    expect(html).toContain("&lt;i&gt;a&lt;/i&gt;");
  });

  it("reports the counts and keeps collapsed markers", () => {
    const long = diffLines(
      ["x", ...Array(20).fill("s")].join("\n"),
      ["y", ...Array(20).fill("s")].join("\n"),
      { context: 2 },
    );
    const html = toHtml(long);
    expect(html).toContain("+1");
    expect(html).toContain("unchanged lines");
  });

  it("keeps an empty line from collapsing to nothing", () => {
    const html = toHtml(diffLines("a\n\nb", "a\n\nc"));
    expect(html).toContain("&nbsp;");
  });
});
