/**
 * Line-wise operations, chained into a pipeline.
 *
 * This is the text toolbox's one processor: which lines survive, in what
 * order, wearing what — plus the in-line rewrites (case, spacing, pangu) that
 * used to live in a separate one-shot formatter. Each step is a pure function
 * of the line array so a pipeline can be re-run from the top whenever a step
 * is edited, and so the preview always reflects the whole chain rather than
 * the last thing that was clicked.
 */

import { panguSpacing } from "./pangu";

export type StepKind =
  | "trim"
  | "mergeSpaces"
  | "removeEmpty"
  | "dedupe"
  | "dedupeAdjacent"
  | "keepDuplicates"
  | "sort"
  | "sortNatural"
  | "sortLength"
  | "reverse"
  | "shuffle"
  | "upper"
  | "lower"
  | "titleCase"
  | "sentence"
  | "pangu"
  | "keepMatching"
  | "dropMatching"
  | "number"
  | "affix"
  | "slice";

export interface Step {
  kind: StepKind;
  /** Search text or pattern, for the filtering steps. */
  pattern?: string;
  regex?: boolean;
  ignoreCase?: boolean;
  /** Sort direction and numbering start. */
  desc?: boolean;
  start?: number;
  /** Affix text. */
  prefix?: string;
  suffix?: string;
  /** Slice bounds, 1-based and inclusive. */
  from?: number;
  to?: number;
}

export function splitLines(text: string): string[] {
  if (!text) return [];
  const parts = text.replace(/\r\n?/g, "\n").split("\n");
  // A file's final newline terminates its last line rather than starting an
  // empty one — same rule the diff uses, for the same reason.
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function matcher(step: Step): (line: string) => boolean {
  const raw = step.pattern ?? "";
  if (!raw) return () => true;
  if (step.regex) {
    try {
      const re = new RegExp(raw, step.ignoreCase ? "i" : "");
      return (l) => re.test(l);
    } catch {
      // An unfinished pattern is a pattern being typed, not a reason to empty
      // the document; matching nothing lets the user keep typing.
      return () => false;
    }
  }
  const needle = step.ignoreCase ? raw.toLowerCase() : raw;
  return (l) => (step.ignoreCase ? l.toLowerCase() : l).includes(needle);
}

/**
 * Compare two strings the way a person reading a file list would: digit runs
 * as numbers, so `item10` sorts after `item9` rather than before it.
 */
export function naturalCompare(a: string, b: string): number {
  const ax = a.match(/(\d+|\D+)/g) ?? [];
  const bx = b.match(/(\d+|\D+)/g) ?? [];
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const x = ax[i];
    const y = bx[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d/.test(x);
    const ny = /^\d/.test(y);
    if (nx && ny) {
      const d = Number(x) - Number(y);
      if (d) return d;
    } else {
      const d = x.localeCompare(y, "zh-Hans-CN");
      if (d) return d;
    }
  }
  return 0;
}

/** Deterministic shuffle, so a preview does not reshuffle on every keystroke. */
function shuffle(lines: string[], seed: number): string[] {
  const out = [...lines];
  let s = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function applyStep(lines: string[], step: Step, seed = 1): string[] {
  const key = (l: string) => (step.ignoreCase ? l.toLowerCase() : l);

  switch (step.kind) {
    case "trim":
      return lines.map((l) => l.trim());
    case "mergeSpaces":
      // Horizontal whitespace only: tabs and runs of spaces have no business
      // surviving, but a line's structure (leading indent is gone anyway
      // after trim) must not collapse into joined words.
      return lines.map((l) => l.replace(/[ \t]{2,}/g, " "));
    case "removeEmpty":
      return lines.filter((l) => l.trim() !== "");
    case "dedupe": {
      const seen = new Set<string>();
      return lines.filter((l) => (seen.has(key(l)) ? false : (seen.add(key(l)), true)));
    }
    case "dedupeAdjacent":
      return lines.filter((l, i) => i === 0 || key(l) !== key(lines[i - 1]));
    case "keepDuplicates": {
      // Every line that appears more than once, each kept once — the inverse
      // question to dedupe, and the one you ask when hunting for collisions.
      const count = new Map<string, number>();
      for (const l of lines) count.set(key(l), (count.get(key(l)) ?? 0) + 1);
      const emitted = new Set<string>();
      return lines.filter((l) => {
        const k = key(l);
        if ((count.get(k) ?? 0) < 2 || emitted.has(k)) return false;
        emitted.add(k);
        return true;
      });
    }
    case "sort": {
      const out = [...lines].sort((a, b) => key(a).localeCompare(key(b), "zh-Hans-CN"));
      return step.desc ? out.reverse() : out;
    }
    case "sortNatural": {
      const out = [...lines].sort((a, b) => naturalCompare(key(a), key(b)));
      return step.desc ? out.reverse() : out;
    }
    case "sortLength": {
      const out = [...lines].sort((a, b) => a.length - b.length || a.localeCompare(b));
      return step.desc ? out.reverse() : out;
    }
    case "reverse":
      return [...lines].reverse();
    case "shuffle":
      return shuffle(lines, seed);
    case "upper":
      return lines.map((l) => l.toUpperCase());
    case "lower":
      return lines.map((l) => l.toLowerCase());
    case "titleCase":
      // Capitalize the first letter of every word; the rest is left alone so
      // "iPhone" doesn't get mangled into "IPhone".
      return lines.map((l) => l.replace(/(^|\s)(\p{L})/gu, (_, p, c: string) => p + c.toUpperCase()));
    case "sentence":
      // Lowercase everything, then recapitalize a line's first letter and any
      // letter that follows a sentence ender.
      return lines.map((l) =>
        l
          .toLowerCase()
          .replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase()),
      );
    case "pangu":
      return lines.map((l) => panguSpacing(l));
    case "keepMatching":
      return lines.filter(matcher(step));
    case "dropMatching": {
      const m = matcher(step);
      return lines.filter((l) => !m(l));
    }
    case "number": {
      const start = Math.floor(step.start ?? 1);
      // Right-aligned to the widest index, so the text stays in one column.
      const width = String(start + lines.length - 1).length;
      return lines.map((l, i) => `${String(start + i).padStart(width, " ")}. ${l}`);
    }
    case "affix":
      return lines.map((l) => `${step.prefix ?? ""}${l}${step.suffix ?? ""}`);
    case "slice": {
      const from = Math.max(1, Math.floor(step.from ?? 1));
      const to = step.to === undefined || step.to <= 0 ? lines.length : Math.floor(step.to);
      return lines.slice(from - 1, to);
    }
    default:
      return lines;
  }
}

export function runPipeline(text: string, steps: Step[], seed = 1): string[] {
  return steps.reduce((acc, s) => applyStep(acc, s, seed), splitLines(text));
}

export interface LineStats {
  lines: number;
  nonEmpty: number;
  unique: number;
  duplicates: number;
  chars: number;
  words: number;
  longest: number;
}

export function stats(lines: string[]): LineStats {
  const seen = new Set(lines);
  return {
    lines: lines.length,
    nonEmpty: lines.filter((l) => l.trim() !== "").length,
    unique: seen.size,
    duplicates: lines.length - seen.size,
    chars: lines.reduce((n, l) => n + [...l].length, 0),
    // Counting by whitespace runs undercounts Chinese badly, so CJK characters
    // are counted one word each — which is what a word count means there.
    words: lines.reduce((n, l) => n + countWords(l), 0),
    longest: lines.reduce((n, l) => Math.max(n, [...l].length), 0),
  };
}

const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/u;

export function countWords(line: string): number {
  let words = 0;
  let inWord = false;
  for (const ch of line) {
    if (CJK.test(ch)) {
      words++;
      inWord = false;
    } else if (/\s/.test(ch)) {
      inWord = false;
    } else if (!inWord) {
      words++;
      inWord = true;
    }
  }
  return words;
}
