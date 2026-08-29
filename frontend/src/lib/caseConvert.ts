/**
 * Identifier naming-style conversion.
 *
 * The hard part is splitting, not joining: input arrives as camelCase,
 * snake_case, kebab-case, "some label", or a mix, and CJK text has no case
 * at all — so CJK runs stay whole and ASCII runs get the boundary treatment.
 */

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

/** Split any identifier-ish text into its words, lowercased. */
export function splitWords(input: string): string[] {
  const words: string[] = [];
  for (const chunk of input.split(/[^A-Za-z0-9\u3400-\u9fff\uf900-\ufaff]+/)) {
    if (!chunk) continue;
    // Keep CJK runs as single words; split ASCII runs on naming boundaries.
    const parts = chunk.split(
      /(?<=[\u3400-\u9fff\uf900-\ufaff])(?=[^\u3400-\u9fff\uf900-\ufaff])|(?<=[^\u3400-\u9fff\uf900-\ufaff])(?=[\u3400-\u9fff\uf900-\ufaff])/,
    );
    for (const part of parts) {
      if (!part) continue;
      if (CJK.test(part)) {
        words.push(part);
        continue;
      }
      const sub = part
        .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2") // fooBar -> foo Bar
        .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2") // FOOBar -> FOO Bar
        .replace(/(\p{L})(\d)/gu, "$1 $2") // width2 -> width 2
        .replace(/(\d)(\p{L})/gu, "$1 $2"); // 2fast -> 2 fast
      for (const w of sub.split(/\s+/)) if (w) words.push(w.toLowerCase());
    }
  }
  return words;
}

export interface CaseStyle {
  id: string;
  /** Shown verbatim — the style names are their own best labels. */
  label: string;
  render: (words: string[]) => string;
}

const cap = (w: string) => (CJK.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1));

export const CASE_STYLES: CaseStyle[] = [
  {
    id: "camel",
    label: "camelCase",
    render: (w) => w.map((x, i) => (i === 0 ? x : cap(x))).join(""),
  },
  {
    id: "pascal",
    label: "PascalCase",
    render: (w) => w.map(cap).join(""),
  },
  { id: "snake", label: "snake_case", render: (w) => w.join("_") },
  { id: "kebab", label: "kebab-case", render: (w) => w.join("-") },
  { id: "constant", label: "CONSTANT_CASE", render: (w) => w.join("_").toUpperCase() },
  { id: "dot", label: "dot.case", render: (w) => w.join(".") },
  { id: "path", label: "path/case", render: (w) => w.join("/") },
  { id: "space", label: "space case", render: (w) => w.join(" ") },
  { id: "title", label: "Title Case", render: (w) => w.map(cap).join(" ") },
];

/** Every style rendered for one input; empty input yields an empty list. */
export function convertAll(input: string): { style: CaseStyle; text: string }[] {
  const words = splitWords(input);
  if (!words.length) return [];
  return CASE_STYLES.map((style) => ({ style, text: style.render(words) }));
}
