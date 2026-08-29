/**
 * Delimited text: parsing, re-emitting and converting.
 *
 * The parser follows RFC 4180 rather than splitting on the delimiter, because
 * every real export contains a field with a comma in it, and half contain one
 * with a newline. Splitting works right up until it silently shifts every
 * column of one row — which is the failure you find three days later in a
 * database.
 */

export type Delimiter = "," | "\t" | ";" | "|";

export const DELIMITERS: { id: Delimiter; key: string }[] = [
  { id: ",", key: "comma" },
  { id: "\t", key: "tab" },
  { id: ";", key: "semicolon" },
  { id: "|", key: "pipe" },
];

/**
 * Guess the delimiter by counting candidates *outside* quoted fields.
 *
 * Counting blindly picks the comma out of `"Smith, John";42;x` — the one
 * character that is not the delimiter there.
 */
export function detectDelimiter(text: string, sample = 20): Delimiter {
  const counts = new Map<Delimiter, number>(DELIMITERS.map((d) => [d.id, 0]));
  let quoted = false;
  let line = 0;
  for (let i = 0; i < text.length && line < sample; i++) {
    const c = text[i];
    if (c === '"') {
      // A doubled quote inside a quoted field is an escaped quote, not an end.
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (c === "\n") {
      line++;
      continue;
    }
    if (counts.has(c as Delimiter)) counts.set(c as Delimiter, counts.get(c as Delimiter)! + 1);
  }
  let best: Delimiter = ",";
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

/**
 * Parse delimited text into rows.
 *
 * Handles quoted fields containing the delimiter, newlines and doubled quotes,
 * a UTF-8 BOM, and both line ending styles. A row's trailing newline
 * terminates it rather than starting an empty row.
 */
export function parse(text: string, delimiter: Delimiter = ","): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = "";
    started = true;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }

    if (c === '"' && field === "") {
      quoted = true;
      started = true;
      continue;
    }
    if (c === delimiter) {
      endField();
      continue;
    }
    if (c === "\r") continue;
    if (c === "\n") {
      endRow();
      continue;
    }
    field += c;
    started = true;
  }

  // Whatever is left is a final row, unless the text simply ended in a newline.
  if (started || field || row.length) endRow();
  return rows;
}

/** Quote a field only where it would otherwise be misread. */
function quote(value: string, delimiter: Delimiter): string {
  return /["\n\r]/.test(value) || value.includes(delimiter)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

export function stringify(rows: string[][], delimiter: Delimiter = ","): string {
  return rows.map((r) => r.map((f) => quote(f ?? "", delimiter)).join(delimiter)).join("\n");
}

/** Column count of the widest row — ragged input is normal, not an error. */
export function width(rows: string[][]): number {
  return rows.reduce((n, r) => Math.max(n, r.length), 0);
}

/** Pad every row to the same width so the table has no holes. */
export function rectangular(rows: string[][]): string[][] {
  const w = width(rows);
  return rows.map((r) => (r.length === w ? r : [...r, ...Array(w - r.length).fill("")]));
}

export interface ToJsonOptions {
  /** Treat the first row as column names. */
  header?: boolean;
  /** Turn numeric-looking values into numbers, and true/false into booleans. */
  coerce?: boolean;
}

function coerceValue(v: string): string | number | boolean | null {
  const t = v.trim();
  if (t === "") return "";
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  // Only what round-trips: "007" and "1e999" must stay strings, or an id gets
  // silently renumbered and a big value becomes Infinity.
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n) && String(n) === t) return n;
  }
  return v;
}

export function toJson(rows: string[][], opts: ToJsonOptions = {}): unknown {
  const grid = rectangular(rows);
  if (!grid.length) return [];
  const map = (v: string) => (opts.coerce ? coerceValue(v) : v);

  if (!opts.header) return grid.map((r) => r.map(map));

  const [head, ...body] = grid;
  const names = head.map((h, i) => (h.trim() || `column${i + 1}`));
  return body.map((r) => Object.fromEntries(names.map((n, i) => [n, map(r[i] ?? "")])));
}

/** A GitHub-flavoured pipe table, ready to paste into a document. */
export function toMarkdown(rows: string[][], header = true): string {
  const grid = rectangular(rows);
  if (!grid.length) return "";
  const esc = (v: string) => v.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const head = header ? grid[0] : grid[0].map((_, i) => `列${i + 1}`);
  const body = header ? grid.slice(1) : grid;
  const line = (cells: string[]) => `| ${cells.map(esc).join(" | ")} |`;
  return [line(head), `| ${head.map(() => "---").join(" | ")} |`, ...body.map(line)].join("\n");
}

export function transpose(rows: string[][]): string[][] {
  const grid = rectangular(rows);
  const w = width(grid);
  return Array.from({ length: w }, (_, c) => grid.map((r) => r[c] ?? ""));
}

/** Keep the given column indices, in the order given. */
export function selectColumns(rows: string[][], keep: number[]): string[][] {
  return rows.map((r) => keep.map((i) => r[i] ?? ""));
}

export interface ColumnStat {
  name: string;
  filled: number;
  empty: number;
  unique: number;
  numeric: boolean;
}

export function columnStats(rows: string[][], header = true): ColumnStat[] {
  const grid = rectangular(rows);
  if (!grid.length) return [];
  const names = header ? grid[0] : grid[0].map((_, i) => `${i + 1}`);
  const body = header ? grid.slice(1) : grid;
  return names.map((name, i) => {
    const values = body.map((r) => r[i] ?? "");
    const filled = values.filter((v) => v.trim() !== "");
    return {
      name: name.trim() || `column${i + 1}`,
      filled: filled.length,
      empty: values.length - filled.length,
      unique: new Set(filled).size,
      numeric: filled.length > 0 && filled.every((v) => Number.isFinite(Number(v.trim()))),
    };
  });
}
