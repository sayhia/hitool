/**
 * Line diff via the classic LCS table, plus an optional token-level pass over
 * the lines that look like edits of one another. Inputs here are pasted
 * documents, not repositories, so an O(n·m) table is fine and keeps the result
 * exact — no heuristics that occasionally mis-align blocks.
 */

export type DiffKind = "same" | "add" | "del";

export interface InlineSeg {
  kind: DiffKind;
  /** The left-hand text, except on `add`, where only a right side exists. */
  text: string;
  /** Set on a `same` segment whose two sides differ under the active ignore
   *  options, so each row can render its own text instead of the other's. */
  other?: string;
}

export interface DiffRow {
  kind: DiffKind;
  /** 1-based line numbers; null on the side where the line doesn't exist. */
  leftNo: number | null;
  rightNo: number | null;
  text: string;
  /** Token-level breakdown, present only on a del/add pair that was matched
   *  up as one edit. Both rows of the pair share the same array: a `del` row
   *  renders the `same` + `del` segments, an `add` row the `same` + `add`. */
  parts?: InlineSeg[];
}

export interface DiffOptions {
  ignoreCase?: boolean;
  ignoreWhitespace?: boolean;
  /** Treat every digit as equal — useful when only generated numbers moved. */
  ignoreDigits?: boolean;
  /** Collapse runs of unchanged lines longer than this. 0 disables. */
  context?: number;
  /** Mark the changed tokens inside paired del/add lines. */
  word?: boolean;
}

function normalise(line: string, o: DiffOptions): string {
  let s = line;
  if (o.ignoreWhitespace) s = s.trim().replace(/\s+/g, " ");
  if (o.ignoreCase) s = s.toLowerCase();
  if (o.ignoreDigits) s = s.replace(/[0-9]/g, "0");
  return s;
}

const LIMIT = 4000; // lines per side; beyond this the table gets unreasonable

/** Ideographs, kana and hangul: scripts written without word separators. */
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ가-힯]/u;
const WORDCH = /[\p{L}\p{N}\p{M}_]/u;
const SPACE = /\s/;

/**
 * Split a line into the units the inline diff aligns on.
 *
 * Latin-script words, numbers and whitespace runs stay whole; CJK characters
 * and punctuation are one token each. Grouping a run of ideographs would make
 * a one-character edit repaint the whole sentence, which is the common case in
 * this app — and CJK offers no separator to group on anyway.
 */
export function tokenize(s: string): string[] {
  const out: string[] = [];
  let buf = "";
  let word = false;

  // Iterating by code point rather than by UTF-16 unit keeps astral
  // characters (emoji, rare ideographs) from being split in half.
  for (const ch of s) {
    const isSpace = SPACE.test(ch);
    const isWord = !isSpace && !CJK.test(ch) && WORDCH.test(ch);
    if (!isSpace && !isWord) {
      if (buf) out.push(buf);
      buf = "";
      out.push(ch);
      continue;
    }
    if (buf && isWord === word) buf += ch;
    else {
      if (buf) out.push(buf);
      buf = ch;
      word = isWord;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** Tokens per line beyond which the table stops being worth building. */
const WORD_LIMIT = 800;
/** Minimum share of tokens two lines must have in common to be shown as one
 *  edit. Below it nearly every token differs, and highlighting all of them
 *  says less than the plain row tint already does. */
const SIMILAR = 0.3;

/**
 * Token-level diff of two lines. Returns null when the pair should keep the
 * plain line-level rendering: one side empty, either side too long to table,
 * or too little in common for the highlight to mean anything.
 */
export function diffWords(a: string, b: string, opts: DiffOptions = {}): InlineSeg[] | null {
  const A = tokenize(a);
  const B = tokenize(b);
  if (!A.length || !B.length) return null;
  if (A.length > WORD_LIMIT || B.length > WORD_LIMIT) return null;

  const na = A.map((tk) => normalise(tk, opts));
  const nb = B.map((tk) => normalise(tk, opts));

  const lcs: Uint32Array[] = Array.from(
    { length: A.length + 1 },
    () => new Uint32Array(B.length + 1),
  );
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--) {
      lcs[i][j] =
        na[i] === nb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  // Whitespace is deliberately left out of the similarity score: two unrelated
  // lines of prose share their spaces and would otherwise look related.
  const solid = (tk: string) => !SPACE.test(tk);
  let common = 0;

  // Both sides are carried through the walk; `other` is dropped at the end
  // wherever it turned out to be redundant.
  const segs: (InlineSeg & { other: string })[] = [];
  const push = (kind: DiffKind, text: string, other: string) => {
    const last = segs[segs.length - 1];
    if (last && last.kind === kind) {
      last.text += text;
      last.other += other;
    } else {
      segs.push({ kind, text, other });
    }
  };

  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (na[i] === nb[j]) {
      if (solid(A[i])) common++;
      push("same", A[i], B[j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push("del", A[i], A[i]);
      i++;
    } else {
      push("add", B[j], B[j]);
      j++;
    }
  }
  for (; i < A.length; i++) push("del", A[i], A[i]);
  for (; j < B.length; j++) push("add", B[j], B[j]);

  const wa = A.filter(solid).length;
  const wb = B.filter(solid).length;
  if (2 * common < SIMILAR * (wa + wb)) return null;

  // `other` only earns its place when the two sides really do differ — under
  // ignoreCase a `same` segment can hold "Hello" on one side and "hello" on
  // the other, and each row has to render its own.
  const out: InlineSeg[] = segs.map((s) =>
    s.other === s.text ? { kind: s.kind, text: s.text } : s,
  );
  return out;
}

/**
 * Attach inline segments to the del/add pairs that read as one edit.
 *
 * A modified line surfaces from the LCS walk as a run of deletions followed by
 * a run of insertions, so pairing them positionally is what turns "these two
 * lines both changed" into "this one word changed". Rows left over from an
 * uneven run are genuine insertions or deletions and keep the plain tint.
 */
function pairInline(rows: DiffRow[], opts: DiffOptions): void {
  let i = 0;
  while (i < rows.length) {
    if (rows[i].kind !== "del") {
      i++;
      continue;
    }
    let d = i;
    while (d < rows.length && rows[d].kind === "del") d++;
    let a = d;
    while (a < rows.length && rows[a].kind === "add") a++;

    const pairs = Math.min(d - i, a - d);
    for (let k = 0; k < pairs; k++) {
      const parts = diffWords(rows[i + k].text, rows[d + k].text, opts);
      if (parts) {
        rows[i + k].parts = parts;
        rows[d + k].parts = parts;
      }
    }
    i = Math.max(a, d); // both are > i, so this always advances
  }
}

export interface DiffResult {
  /** Collapsed rather than DiffRow: `collapse` may fold unchanged runs into
   *  placeholder rows, and callers need to see the `skipped` marker. */
  rows: Collapsed[];
  added: number;
  removed: number;
  truncated: boolean;
}

/**
 * Split into lines, treating a final newline as a terminator rather than as
 * the start of an empty last one.
 *
 * `"a\nb\n".split("\n")` ends in an empty string, and every text file ends in
 * a newline — so a loaded file would show a phantom blank row at the bottom,
 * count one line too many, and produce hunk headers one line longer than the
 * ones diff(1) writes. What is lost is the difference between `"a\n"` and
 * `"a"`, which is why the unified export carries it separately.
 */
export function splitLines(s: string): string[] {
  if (!s) return [];
  const parts = s.split("\n");
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
}

export function diffLines(a: string, b: string, opts: DiffOptions = {}): DiffResult {
  const rawA = splitLines(a);
  const rawB = splitLines(b);
  const truncated = rawA.length > LIMIT || rawB.length > LIMIT;
  const A = rawA.slice(0, LIMIT);
  const B = rawB.slice(0, LIMIT);

  const na = A.map((l) => normalise(l, opts));
  const nb = B.map((l) => normalise(l, opts));

  // The identical head and tail need no LCS: greedily matching a common prefix
  // or suffix never shortens the longest common subsequence, so the matrix only
  // has to span what lies between them. This is what the cost is actually
  // proportional to — editing a paragraph of a 4000-line file leaves the other
  // 3990 lines aligned, and the full matrix would have been 16M cells to say so.
  let head = 0;
  while (head < A.length && head < B.length && na[head] === nb[head]) head++;
  let tail = 0;
  while (
    tail < A.length - head &&
    tail < B.length - head &&
    na[A.length - 1 - tail] === nb[B.length - 1 - tail]
  ) {
    tail++;
  }

  // The window still to be aligned. Either side can be empty — an insertion at
  // the end leaves nothing of A between head and tail.
  const m = A.length - tail - head;
  const n = B.length - tail - head;

  // lcs[p][q] = LCS length of the two windows from p and q onward, held flat:
  // one allocation instead of m+1 typed arrays, and rows land next to each
  // other in memory. Uint16 is enough because a subsequence cannot be longer
  // than the shorter window, and LIMIT caps that far below 65535.
  const stride = n + 1;
  const lcs = new Uint16Array((m + 1) * stride);
  for (let p = m - 1; p >= 0; p--) {
    const row = p * stride;
    const next = row + stride;
    for (let q = n - 1; q >= 0; q--) {
      lcs[row + q] =
        na[head + p] === nb[head + q]
          ? lcs[next + q + 1] + 1
          : Math.max(lcs[next + q], lcs[row + q + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  for (let k = 0; k < head; k++) {
    rows.push({ kind: "same", leftNo: k + 1, rightNo: k + 1, text: A[k] });
  }
  let p = 0;
  let q = 0;
  while (p < m && q < n) {
    if (na[head + p] === nb[head + q]) {
      rows.push({ kind: "same", leftNo: head + p + 1, rightNo: head + q + 1, text: A[head + p] });
      p++;
      q++;
    } else if (lcs[(p + 1) * stride + q] >= lcs[p * stride + q + 1]) {
      rows.push({ kind: "del", leftNo: head + p + 1, rightNo: null, text: A[head + p] });
      removed++;
      p++;
    } else {
      rows.push({ kind: "add", leftNo: null, rightNo: head + q + 1, text: B[head + q] });
      added++;
      q++;
    }
  }
  for (; p < m; p++) {
    rows.push({ kind: "del", leftNo: head + p + 1, rightNo: null, text: A[head + p] });
    removed++;
  }
  for (; q < n; q++) {
    rows.push({ kind: "add", leftNo: null, rightNo: head + q + 1, text: B[head + q] });
    added++;
  }
  for (let k = 0; k < tail; k++) {
    const i = A.length - tail + k;
    rows.push({ kind: "same", leftNo: i + 1, rightNo: B.length - tail + k + 1, text: A[i] });
  }

  // Before collapsing: `collapse` only ever folds unchanged rows, but pairing
  // reads runs of adjacent del/add rows and shouldn't have to skip markers.
  if (opts.word) pairInline(rows, opts);

  return { rows: collapse(rows, opts.context ?? 0), added, removed, truncated };
}

export interface Collapsed extends DiffRow {
  /** Set on a placeholder row standing in for a run of unchanged lines. */
  skipped?: number;
}

export interface RowPiece {
  text: string;
  /** True for the part of the line that this row's side actually changed. */
  changed: boolean;
}

/**
 * One row's share of an inline breakdown: a deleted row shows what was there
 * before, an added row what is there now, and both show the common parts —
 * each in its own text, since ignoreCase can let the two sides differ.
 *
 * Empty when the row has no breakdown; the caller renders `text` as it is.
 */
export function rowPieces(r: DiffRow): RowPiece[] {
  if (!r.parts) return [];
  const mine = r.kind === "del" ? "del" : "add";
  const out: RowPiece[] = [];
  for (const p of r.parts) {
    if (p.kind === "same") {
      out.push({ text: r.kind === "add" ? (p.other ?? p.text) : p.text, changed: false });
    } else if (p.kind === mine) {
      out.push({ text: p.text, changed: true });
    }
  }
  return out;
}

const SIGN: Record<DiffKind, string> = { same: " ", add: "+", del: "-" };

/**
 * A unified diff, the format that pastes into a review and feeds `patch`.
 *
 * The comparison options are honoured so the file matches what is on screen,
 * but a patch built with "ignore case" on claims lines are identical when they
 * are not and will not apply cleanly. Everything ahead of the `---`/`+++` pair
 * is ignored by patch(1) — it is where git puts commit messages — so that is
 * where the warning goes.
 */
export function toUnified(
  a: string,
  b: string,
  opts: DiffOptions & { leftName?: string; rightName?: string } = {},
): string {
  const context = Math.max(0, opts.context ?? 3);
  const { rows } = diffLines(a, b, { ...opts, context: 0, word: false });
  // Nothing to patch when no line changed. A difference in the trailing
  // newline alone is deliberately not counted: the screen calls those two
  // texts identical, and an export that disagreed with it would be worse than
  // one that cannot express the distinction.
  if (!rows.some((r) => r.kind !== "same")) return "";

  const aNoEol = a.length > 0 && !a.endsWith("\n");
  const bNoEol = b.length > 0 && !b.endsWith("\n");

  // A context line that ends one side without a newline cannot stay context:
  // as context it says both sides continue identically, and the marker after
  // it would speak for both. It only stays when the *same* line ends both
  // sides and both lack the newline — then one marker is right for both.
  // diff(1) splits it into a delete plus an insert for exactly this reason.
  //
  // At most one row qualifies: a shared line that is final on one side has
  // only insertions after it, and one final on the other only deletions.
  {
    let sawLeft = false;
    let sawRight = false;
    for (let k = rows.length - 1; k >= 0; k--) {
      const r = rows[k];
      const endsLeft = !sawLeft && r.kind !== "add";
      const endsRight = !sawRight && r.kind !== "del";
      if (r.kind !== "add") sawLeft = true;
      if (r.kind !== "del") sawRight = true;
      if (r.kind === "same" && (endsLeft && aNoEol) !== (endsRight && bNoEol)) {
        rows.splice(
          k,
          1,
          { ...r, kind: "del", rightNo: null },
          { ...r, kind: "add", leftNo: null },
        );
        break;
      }
      if (sawLeft && sawRight) break;
    }
  }

  // diff(1) writes every deletion of a change block ahead of its insertions,
  // and that is the shape reviewers read. The split above can break the order,
  // and the LCS walk is free to interleave; both are fixed by grouping each
  // run. Applying either order yields the same text, so this is presentation.
  for (let s = 0; s < rows.length; ) {
    if (rows[s].kind === "same") {
      s++;
      continue;
    }
    let e = s;
    while (e < rows.length && rows[e].kind !== "same") e++;
    const run = rows.slice(s, e);
    const dels = run.filter((r) => r.kind === "del");
    const adds = run.filter((r) => r.kind === "add");
    if (dels.length && adds.length) rows.splice(s, e - s, ...dels, ...adds);
    s = e;
  }

  const keep = new Array(rows.length).fill(false);
  rows.forEach((r, i) => {
    if (r.kind === "same") return;
    for (let k = i - context; k <= i + context; k++) {
      if (k >= 0 && k < rows.length) keep[k] = true;
    }
  });

  const out: string[] = [];
  const inexact: string[] = [];
  if (opts.ignoreCase) inexact.push("ignore case");
  if (opts.ignoreWhitespace) inexact.push("ignore whitespace");
  if (opts.ignoreDigits) inexact.push("ignore digits");
  if (inexact.length) {
    out.push(`# compared with ${inexact.join(" + ")}; this patch may not apply`);
  }
  out.push(`--- ${opts.leftName || "a"}`);
  out.push(`+++ ${opts.rightName || "b"}`);

  // A file whose last line has no newline is called out, exactly as diff(1)
  // does — without it a patch applied to such a file silently gains one.
  const totalLeft = rows.reduce((n, r) => n + (r.kind === "add" ? 0 : 1), 0);
  const totalRight = rows.reduce((n, r) => n + (r.kind === "del" ? 0 : 1), 0);

  let left = 0;
  let right = 0;
  let i = 0;
  while (i < rows.length) {
    if (!keep[i]) {
      if (rows[i].kind !== "add") left++;
      if (rows[i].kind !== "del") right++;
      i++;
      continue;
    }
    const l0 = left;
    const r0 = right;
    const body: string[] = [];
    let lCount = 0;
    let rCount = 0;
    while (i < rows.length && keep[i]) {
      const r = rows[i];
      if (r.kind !== "add") {
        left++;
        lCount++;
      }
      if (r.kind !== "del") {
        right++;
        rCount++;
      }
      body.push(SIGN[r.kind] + r.text);
      // One marker for a context line that ends both sides, two when a
      // changed last line is emitted once per side.
      if (
        (r.kind !== "add" && left === totalLeft && aNoEol) ||
        (r.kind !== "del" && right === totalRight && bNoEol)
      ) {
        body.push("\\ No newline at end of file");
      }
      i++;
    }
    // A zero count means "insert after this line", so the start stays at the
    // last line before the hunk instead of advancing past it. A count of one
    // is written bare — the format drops the comma in that case.
    const range = (start: number, count: number) =>
      count === 1 ? `${start}` : `${start},${count}`;
    out.push(
      `@@ -${range(lCount ? l0 + 1 : l0, lCount)} +${range(rCount ? r0 + 1 : r0, rCount)} @@`,
      ...body,
    );
  }
  return out.join("\n");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A standalone HTML page of the result as it is on screen — including the
 * word-level marks, which the unified format has no way to carry.
 *
 * Takes the finished result rather than the two texts so the export cannot
 * disagree with what the user is looking at.
 */
export function toHtml(
  res: DiffResult,
  opts: { leftName?: string; rightName?: string; title?: string } = {},
): string {
  const left = opts.leftName || "a";
  const right = opts.rightName || "b";
  const body = res.rows
    .map((r) => {
      if (r.skipped) {
        return `<div class="row skip">⋯ ${r.skipped} unchanged lines</div>`;
      }
      const pieces = rowPieces(r);
      const text = pieces.length
        ? pieces.map((p) => (p.changed ? `<mark>${esc(p.text)}</mark>` : esc(p.text))).join("")
        : esc(r.text) || "&nbsp;";
      return (
        `<div class="row ${r.kind}">` +
        `<span class="no">${r.leftNo ?? ""}</span>` +
        `<span class="no">${r.rightNo ?? ""}</span>` +
        `<span class="sign">${SIGN[r.kind]}</span>` +
        `<span class="txt">${text}</span>` +
        `</div>`
      );
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>${esc(opts.title || `${left} → ${right}`)}</title>
<style>
:root { color-scheme: light dark; --ok:#17855c; --fail:#cf3f45; --okbg:#e6f6ef; --failbg:#fdedee; --okmk:#b6e3ce; --failmk:#f5c5c7; --line:#e3e1dc; --dim:#8a867e; }
@media (prefers-color-scheme: dark) { :root { --ok:#46c294; --fail:#f0797f; --okbg:#12291f; --failbg:#2c1618; --okmk:#1f4a37; --failmk:#532427; --line:#2e2c29; --dim:#8a867e; } }
body { margin:0; padding:24px; font:13px/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
h1 { font:600 15px/1.5 system-ui,sans-serif; margin:0 0 4px; }
.meta { font:12px/1.6 system-ui,sans-serif; color:var(--dim); margin:0 0 14px; }
.diff { border:1px solid var(--line); border-radius:8px; overflow:hidden; }
.row { display:grid; grid-template-columns:52px 52px 18px 1fr; gap:4px; padding:0 10px; white-space:pre-wrap; word-break:break-word; }
.row.add { background:var(--okbg); } .row.del { background:var(--failbg); }
.row.add .sign { color:var(--ok); } .row.del .sign { color:var(--fail); }
.no { text-align:right; color:var(--dim); font-size:11px; user-select:none; }
.sign { text-align:center; font-weight:700; user-select:none; }
.skip { display:block; text-align:center; color:var(--dim); font-size:11px; padding:3px 0; }
mark { background:var(--okmk); color:inherit; border-radius:3px; }
.row.del mark { background:var(--failmk); }
</style>
<h1>${esc(left)} → ${esc(right)}</h1>
<p class="meta">+${res.added} / −${res.removed}${res.truncated ? " · truncated" : ""}</p>
<div class="diff">
${body}
</div>
`;
}

/** Replace long unchanged runs with a single "N unchanged lines" marker. */
function collapse(rows: DiffRow[], context: number): Collapsed[] {
  if (context <= 0) return rows;

  const keep = new Array(rows.length).fill(false);
  rows.forEach((r, idx) => {
    if (r.kind === "same") return;
    for (let k = idx - context; k <= idx + context; k++) {
      if (k >= 0 && k < rows.length) keep[k] = true;
    }
  });

  const out: Collapsed[] = [];
  let run = 0;
  for (let idx = 0; idx < rows.length; idx++) {
    if (keep[idx]) {
      if (run) {
        out.push({ kind: "same", leftNo: null, rightNo: null, text: "", skipped: run });
        run = 0;
      }
      out.push(rows[idx]);
    } else {
      run++;
    }
  }
  if (run) out.push({ kind: "same", leftNo: null, rightNo: null, text: "", skipped: run });
  return out;
}
