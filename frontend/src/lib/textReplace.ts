/**
 * Find-and-replace over plain text. The tool speaks two languages — literal
 * text and regex — and both end up here as one RegExp, so matching and
 * replacement have exactly one code path (replaceAll in regexReplace.ts).
 */

export interface FindOptions {
  query: string;
  /** Interpret the query as a regex instead of literal text. */
  regex: boolean;
  caseSensitive: boolean;
  /** Literal matches must sit on word boundaries (regex users write \b). */
  wholeWord: boolean;
}

export interface Compiled {
  re: RegExp | null;
  error: string;
}

/** Backslash every character that a RegExp would read as syntax. */
export function escapeRegExp(src: string): string {
  return src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile the find settings into a global regex.
 *
 * No `u` flag: it would reject backslash-escaped literals (an escaped space is
 * invalid under unicode mode), and nothing in the tool needs code-point
 * semantics that `\w`/`i` don't already provide. `m` is on so `^`/`$` behave
 * per-line, which is what a text tool's user expects an anchor to mean.
 */
export function compileFind(o: FindOptions): Compiled {
  if (!o.query) return { re: null, error: "" };
  let src = o.regex ? o.query : escapeRegExp(o.query);
  if (!o.regex && o.wholeWord) src = `\\b(?:${src})\\b`;
  const flags = `gm${o.caseSensitive ? "" : "i"}`;
  try {
    return { re: new RegExp(src, flags), error: "" };
  } catch (e) {
    return { re: null, error: (e as Error).message };
  }
}
