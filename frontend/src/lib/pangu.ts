/**
 * "Pangu spacing": insert a single space where CJK characters meet half-width
 * letters or digits (盘古之白). Idempotent — a boundary that already has a
 * space does not match, so running it twice changes nothing.
 *
 * Code is left alone: fenced blocks and inline `code` spans pass through
 * untouched, because spacing inside identifiers and literals would damage
 * whatever the text is describing.
 */

/** Ideographs, kana and hangul: the scripts pangu spacing applies to. */
const CJK_CLASS = "぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ가-힯";
const CJK = `[${CJK_CLASS}]`;
const ALNUM = "[A-Za-z0-9]";

const CJK_ALNUM = new RegExp(`(${CJK})(${ALNUM})`, "g");
const ALNUM_CJK = new RegExp(`(${ALNUM})(${CJK})`, "g");

/** Direct adjacency only: an existing space stops the match, which is what
 *  makes the whole pass safe to re-run. */
function spaceRun(s: string): string {
  return s.replace(CJK_ALNUM, "$1 $2").replace(ALNUM_CJK, "$1 $2");
}

const CJK_LEAD = new RegExp(`^[${CJK_CLASS}]`);
const CJK_TAIL = new RegExp(`[${CJK_CLASS}]$`);

/** Space one line, skipping inline code spans (anything between backticks).
 *  The backtick boundary is judged by the prose side only: a span whose own
 *  first character is CJK must not gain a space inside it. */
function spaceLine(line: string): string {
  if (!line.includes("`")) return spaceRun(line);
  const parts = line.split("`");
  for (let i = 0; i < parts.length; i += 2) {
    let p = spaceRun(parts[i]);
    if (i > 0 && CJK_LEAD.test(p)) p = " " + p;
    if (i < parts.length - 1 && CJK_TAIL.test(p)) p += " ";
    parts[i] = p;
  }
  return parts.join("`");
}

const FENCE = /^\s*(```|~~~)/;

export function panguSpacing(text: string): string {
  const lines = text.split("\n");
  let fenced = false;
  const out = lines.map((line) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return line;
    }
    return fenced ? line : spaceLine(line);
  });
  return out.join("\n");
}
