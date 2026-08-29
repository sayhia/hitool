/**
 * JSON ⇄ CSV conversion for arrays of records. Nested objects flatten into
 * dot-path columns (`user.city`), so a round trip JSON → CSV → JSON restores
 * the nesting. Arrays and other non-scalar values are serialised as JSON
 * text; everything else stays a plain string cell.
 */
import * as csv from "./csv";

/** Flatten one record into dot-path cells. Keys keep first-seen order. */
export function flattenRecord(value: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    // Scalars at the top level have no column name of their own.
    return out;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) {
      out[key] = "";
    } else if (typeof v === "object") {
      if (Array.isArray(v)) out[key] = JSON.stringify(v);
      else Object.assign(out, flattenRecord(v, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

export interface ObjectsToCsvOptions {
  delimiter?: csv.Delimiter;
}

/**
 * Records → CSV text with a header row. The header is the union of every
 * record's keys in first-seen order; missing cells stay empty. Throws when
 * given anything but an array.
 */
export function objectsToCsv(records: unknown[], opts: ObjectsToCsvOptions = {}): string {
  if (!Array.isArray(records)) {
    throw new Error("expected an array of objects");
  }
  const rows = records.map((r) => flattenRecord(r));
  const keys: string[] = [];
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!keys.includes(k)) keys.push(k);
    }
  }
  if (!keys.length) return "";
  const grid = [keys, ...rows.map((r) => keys.map((k) => r[k] ?? ""))];
  return csv.stringify(grid, opts.delimiter ?? ",");
}

/** Scalar coercion mirrors lib/csv's: only values that round-trip convert. */
function coerce(v: string): string | number | boolean | null {
  const t = v.trim();
  if (t === "") return "";
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n) && String(n) === t) return n;
  }
  return v;
}

/** Expand one flat record's dot paths back into nested objects. */
export function unflattenRecord(flat: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split(".");
    let node = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (typeof node[seg] !== "object" || node[seg] === null) node[seg] = {};
      node = node[seg] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1];
    // A branch wins over a scalar collision ("a" alongside "a.b").
    if (typeof node[last] === "object" && node[last] !== null) continue;
    node[last] = value;
  }
  return out;
}

/**
 * CSV text → records. The first row is always the header; dot-path headers
 * rebuild nested objects.
 */
export function csvToObjects(text: string, delimiter?: csv.Delimiter): Record<string, unknown>[] {
  const rows = csv.parse(text, delimiter ?? csv.detectDelimiter(text));
  if (rows.length < 2) return [];
  const [head, ...body] = rows;
  return body.map((r) => {
    const flat: Record<string, unknown> = {};
    head.forEach((k, i) => {
      const key = k.trim() || `column${i + 1}`;
      flat[key] = coerce(r[i] ?? "");
    });
    return unflattenRecord(flat);
  });
}
