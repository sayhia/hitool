/**
 * Fuzzy matching for the command palette.
 *
 * Two tiers, deliberately simple: a contiguous substring is always the best
 * answer and ranks by how early it appears; anything else falls back to an
 * ordered subsequence, ranked by how tight the match is. Ranges come back so
 * the UI can underline exactly what matched.
 */

export interface FuzzyHit {
  /** Higher is better; substring hits always outrank subsequence hits. */
  score: number;
  /** Matched [start, end) ranges over the original target, for highlighting. */
  ranges: [number, number][];
}

/** Merge adjacent/overlapping ranges so a highlight renders as few marks as possible. */
function mergeRanges(rs: [number, number][]): [number, number][] {
  const sorted = [...rs].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

export function fuzzyMatch(query: string, target: string): FuzzyHit | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, ranges: [] };
  const t = target.toLowerCase();

  const idx = t.indexOf(q);
  if (idx >= 0) return { score: 1000 - idx * 2, ranges: [[idx, idx + q.length]] };

  // Subsequence: each query character must appear in order. Tighter spans rank
  // higher, so "tst" prefers "text-stats" over something sprawled.
  const ranges: [number, number][] = [];
  let from = 0;
  for (const ch of q) {
    const at = t.indexOf(ch, from);
    if (at < 0) return null;
    ranges.push([at, at + 1]);
    from = at + 1;
  }
  const span = ranges[ranges.length - 1][1] - ranges[0][0];
  return { score: 500 - (span - q.length) * 6, ranges: mergeRanges(ranges) };
}

export interface TextPart {
  text: string;
  hit: boolean;
}

/** Split a string into highlighted and plain parts for rendering. */
export function splitHighlight(text: string, ranges: [number, number][]): TextPart[] {
  if (!ranges.length) return text ? [{ text, hit: false }] : [];
  const parts: TextPart[] = [];
  let pos = 0;
  for (const [a, b] of ranges) {
    if (a > pos) parts.push({ text: text.slice(pos, a), hit: false });
    parts.push({ text: text.slice(a, b), hit: true });
    pos = b;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), hit: false });
  return parts;
}
