import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toUnified } from "./diff";

/**
 * `toUnified` claims to emit standard unified diff, so the cheapest way to
 * hold it to that is to ask diff(1) the same questions. This caught a phantom
 * trailing line, the `@@ -1 +0,0 @@` abbreviation, the `\\ No newline` marker
 * and its placement, and the deletions-before-insertions ordering.
 *
 * The suite runs everywhere else in plain node, so it skips itself rather than
 * fail where diff(1) is missing.
 */

const dir = mkdtempSync(join(tmpdir(), "agree-"));
const A = join(dir, "a");
const B = join(dir, "b");
let hasDiff = true;
try {
  execFileSync("diff", ["--version"], { stdio: "ignore" });
} catch {
  hasDiff = false;
}

const gnu = (a: string, b: string) => {
  writeFileSync(A, a);
  writeFileSync(B, b);
  try {
    execFileSync("diff", ["-u", "--label", "a", "--label", "b", A, B], { encoding: "utf8" });
    return "";
  } catch (e: any) {
    return String(e.stdout ?? "").replace(/\n$/, "");
  }
};

// diff(1) implementations disagree on where `\ No newline at end of file`
// lands on multi-hunk output: GNU (3.10+) puts it after the changed last
// line, Apple/FreeBSD also drops an extra one after the first hunk's last
// context line. The marker itself is asserted by the fixed cases above;
// the cross-product compares everything else, so the marker line is
// stripped from both sides first.
const norm = (s: string) =>
  s
    .split("\n")
    .filter((l) => l !== "\\ No newline at end of file")
    .join("\n");

const CASES: [string, string][] = [
  ["a\nb\nc\n", "a\nB\nc\n"],
  ["a\nb\nc", "a\nB\nc"],
  ["a\nb\nc\n", "a\nB\nc"],
  ["a\nb\nc", "a\nB\nc\n"],
  ["", "hello\n"],
  ["", "hello"],
  ["hello\n", ""],
  ["hello", ""],
  ["x\ny\n", "x\nz\ny\n"],
  ["x\ny\n", "x\ny\n"],
  ["one\ntwo\nthree\nfour\nfive\n", "one\ntwo\n3\nfour\nfive\n"],
  [
    Array.from({ length: 30 }, (_, i) => `l${i}`).join("\n") + "\n",
    Array.from({ length: 30 }, (_, i) => (i === 0 || i === 29 ? `L${i}` : `l${i}`)).join("\n") + "\n",
  ],
  ["同一行\n变化行\n尾行\n", "同一行\n变化了\n尾行\n"],
  ["trailing\n\n\n", "trailing\n\n"],
  ["a\n", "a\nb\nc\nd\ne\nf\n"],
  ["a\nb\n", "b\na\n"],
];

describe.skipIf(!hasDiff)("agreement with diff -u", () => {
  for (const [a, b] of CASES) {
    it(JSON.stringify([a, b]).slice(0, 60), () => {
      expect(toUnified(a, b)).toBe(gnu(a, b));
    });
  }

  // 784 (edits × edits × eol) cases, each spawning a diff(1) process; on
  // Windows that is far slower than the 5s default, so give it headroom.
  it(
    "agrees across a generated cross-product",
    () => {
      const base = Array.from({ length: 12 }, (_, i) => `line ${i}`);
    // Every inserted or replaced line is distinct: a repeated token makes the
    // LCS ambiguous, and diff(1) breaks those ties with heuristics this exact
    // implementation deliberately does not have. Format conformance is what
    // this harness is for.
    const edits: ((l: string[]) => string[])[] = [
      (l) => l,
      (l) => l.filter((_, i) => i !== 0),
      (l) => l.filter((_, i) => i !== 5),
      (l) => l.filter((_, i) => i !== 11),
      (l) => l.filter((_, i) => i !== 4 && i !== 5),
      (l) => l.map((x, i) => (i === 0 ? "CHANGED-a" : x)),
      (l) => l.map((x, i) => (i === 6 ? "CHANGED-b" : x)),
      (l) => l.map((x, i) => (i === 11 ? "CHANGED-c" : x)),
      (l) => l.map((x, i) => (i === 2 ? "CHANGED-d" : i === 9 ? "CHANGED-e" : x)),
      (l) => ["NEW-head", ...l],
      (l) => [...l, "NEW-tail"],
      (l) => [...l.slice(0, 6), "NEW-mid", ...l.slice(6)],
      (l) => [...l.slice(0, 3), "N1", "N2", ...l.slice(3, 8)],
      (l) => [],
      // Deliberately no fully-reversed variant: LCS has many optimal
      // solutions and diff(1) breaks ties its own way, so that case compares
      // tie-breaking rather than the format this harness is about. Both
      // alignments keep one line in common; ours costs two more churn lines
      // there because that one line is also the one the newline split hits.
    ];
    const eol = [true, false];
    let checked = 0;
    for (const ea of edits) {
      for (const eb of edits) {
        for (const na of eol) {
          for (const nb of eol) {
            const mk = (ls: string[], nl: boolean) => (ls.length ? ls.join("\n") + (nl ? "\n" : "") : "");
            const a = mk(ea(base), na);
            const b = mk(eb(base), nb);
            const mine = toUnified(a, b);
            const theirs = gnu(a, b);
            if (mine === "" && theirs !== "") {
              // The one deliberate divergence: texts that differ only in the
              // trailing newline are "identical" on screen, and an export
              // that contradicted the screen would be worse than one that
              // cannot express the distinction.
              expect(a.replace(/\n$/, ""), JSON.stringify([a, b])).toBe(b.replace(/\n$/, ""));
            } else {
              expect(norm(mine), JSON.stringify([a, b])).toBe(norm(theirs));
            }
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(edits.length * edits.length * 4);
    },
    60_000,
  );
});
