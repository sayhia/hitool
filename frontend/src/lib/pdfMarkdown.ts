/**
 * Turns the flat item stream pdfjs hands back into Markdown lines. The text
 * layer carries no structure, so we reconstruct headings from font size and
 * list markers from leading glyphs. Good enough for documents, deliberately
 * conservative for everything else.
 */

export interface MdItem {
  str: string;
  /** Font size in text-space units; used to detect headings. */
  size: number;
  y: number;
}

interface MdLine {
  text: string;
  size: number;
  y: number;
}

const HEADING_RE = /^(#{1,6})\s+/;
const LIST_RE = /^([•▪◦·∙‣※]|[·•]\s*)$/;

/** Collapses consecutive same-sized items sharing a y into logical lines. */
export function groupLines(items: MdItem[]): MdLine[] {
  const lines: MdLine[] = [];
  let cur: MdLine | null = null;
  for (const it of items) {
    const s = it.str.trim();
    if (!s) {
      if (cur) lines.push(cur);
      cur = null;
      continue;
    }
    if (cur && Math.abs(it.y - cur.y) < 1) {
      cur.text += (needsSpace(cur.text, s) ? " " : "") + s;
      cur.size = Math.max(cur.size, it.size);
    } else {
      if (cur) lines.push(cur);
      cur = { text: s, size: it.size, y: it.y };
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** CJK glues words together; Latin runs need a space between them. */
function needsSpace(before: string, after: string): boolean {
  if (!before) return false;
  const b = [...before].pop()!;
  const a = [...after][0];
  const cjk = (c: string) => /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(c);
  if (cjk(b) || cjk(a)) return false;
  return true;
}

function isListMarker(text: string): boolean {
  return LIST_RE.test(text.trim());
}

function looksLikeHeading(
  line: MdLine,
  bodySize: number,
  bodyCount: number,
  relaxed: boolean,
): boolean {
  const t = line.text.trim();
  if (!t || t.length > 80) return false;
  if (HEADING_RE.test(t)) return true;
  // A lone bigger line among plenty of body text reads as a heading.
  return (relaxed || bodyCount >= 3) && line.size >= bodySize * 1.18;
}

/** Median size is robust to the few oversized title lines. */
export function dominantSize(lines: MdLine[]): number {
  if (!lines.length) return 0;
  const sizes = lines.map((l) => l.size).sort((a, b) => a - b);
  // Lower median: with an even count a single oversize title must not win.
  return sizes[Math.floor((sizes.length - 1) / 2)];
}

/**
 * Converts grouped lines of one page into Markdown. `firstPage` relaxes the
 * body-text requirement so a document whose page one is only a title still
 * gets its heading.
 */
export function pageToMarkdown(
  lines: MdLine[],
  opts: { firstPage?: boolean } = {},
): string {
  const bodySize = dominantSize(lines);
  const bodyCount = lines.filter((l) => Math.abs(l.size - bodySize) < 0.5).length;
  const out: string[] = [];
  let listOpen = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text.trim();
    if (!text) continue;

    // List: a bullet glyph followed by content on the next line.
    if (isListMarker(text) && i + 1 < lines.length) {
      if (!listOpen) {
        if (out.length) out.push("");
        listOpen = true;
      }
      out.push(`- ${lines[i + 1].text.trim()}`);
      i++;
      continue;
    }

    const m = HEADING_RE.exec(text);
    const heading = looksLikeHeading(line, bodySize, bodyCount, !!opts.firstPage);
    if (heading) {
      listOpen = false;
      if (out.length) out.push("");
      const level = m ? m[1].length : line.size >= bodySize * 1.6 ? 1 : 2;
      out.push(`${"#".repeat(level)} ${text.replace(HEADING_RE, "")}`);
      out.push("");
      continue;
    }

    if (listOpen && !text.startsWith("-")) listOpen = false;
    out.push(text);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
