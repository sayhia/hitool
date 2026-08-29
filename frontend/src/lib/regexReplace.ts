/**
 * Regex replacement with a segmented result, so the preview can show *what*
 * changed rather than just the final string.
 *
 * `String.prototype.replace` already understands `$1`, `$<name>`, `$&`, `` $` ``,
 * `$'` and `$$`, so the substitution itself is delegated to it — reimplementing
 * that grammar would only introduce disagreements with the engine the user is
 * testing against. What is added here is the bookkeeping: where each
 * replacement landed in the output, and how many there were.
 */

export interface ReplaceSegment {
  text: string;
  /** True for text produced by the replacement rather than carried over. */
  hit: boolean;
}

export interface ReplaceResult {
  output: string;
  segments: ReplaceSegment[];
  count: number;
  error?: string;
}

export function replaceAll(
  subject: string,
  re: RegExp | null,
  replacement: string,
  limit = 5000,
): ReplaceResult {
  if (!re) return { output: subject, segments: [{ text: subject, hit: false }], count: 0 };
  // No shortcut for an empty subject: a pattern that can match nothing still
  // matches once at position 0, so "".replace(/a*/g, "-") is "-", not "".

  const out: ReplaceSegment[] = [];
  let output = "";
  let count = 0;
  let cursor = 0;

  const push = (text: string, hit: boolean) => {
    if (!text) return;
    output += text;
    // Merge with the previous run when it has the same kind, so the DOM
    // doesn't end up with a span per character on a `.` pattern.
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.text += text;
    else out.push({ text, hit });
  };

  // A sticky, non-global copy: pointed at one match's index it replaces
  // exactly that occurrence while still seeing the whole subject. Slicing the
  // match out and replacing within it would be simpler but wrong — `\b`,
  // lookbehind and `` $` `` all need the surrounding text, and a `\b` has no
  // boundary inside a one-character slice.
  const anchored = new RegExp(re.source, re.flags.replace(/[gy]/g, "") + "y");

  const substitute = (m: RegExpExecArray): string => {
    try {
      anchored.lastIndex = m.index;
      const replaced = subject.replace(anchored, replacement);
      // Text before the match is untouched, and so is the tail after it; what
      // lies between is exactly the expansion.
      const tail = subject.length - (m.index + m[0].length);
      return replaced.slice(m.index, replaced.length - tail);
    } catch {
      return m[0];
    }
  };

  const exec = (): RegExpExecArray | null => {
    re.lastIndex = re.global || re.sticky ? cursor : 0;
    return re.exec(subject);
  };

  let m: RegExpExecArray | null;
  while ((m = exec()) !== null) {
    if (m.index > cursor) push(subject.slice(cursor, m.index), false);
    push(substitute(m), true);
    count++;

    if (m[0] === "") {
      // Nothing was consumed. Step past the position — leaving the cursor
      // where it was lets the same index match again, which on /^/gm emits
      // the replacement twice per line. The character it sat on still has to
      // be carried across, or it vanishes from the output.
      cursor = m.index + 1;
      if (m.index < subject.length) push(subject[m.index], false);
    } else {
      cursor = m.index + m[0].length;
    }

    if (!re.global && !re.sticky) break;
    if (count >= limit || cursor > subject.length) break;
  }

  if (cursor < subject.length) push(subject.slice(cursor), false);
  return { output, segments: out, count };
}
