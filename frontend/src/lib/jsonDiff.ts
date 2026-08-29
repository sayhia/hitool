/**
 * Structural comparison of two JSON documents.
 *
 * A text diff of two formatted API responses answers the wrong question: it
 * reports reordered keys as changes, buries a single altered field in a wall
 * of re-indented context, and cannot tell "field became a string" from "field
 * got a new value". This walks the two values instead and reports each
 * difference by path — the same `$['a'][0]` spelling `lib/jsonpath.ts` emits,
 * so a path from here can be pasted straight into the JSONPath box.
 */

export type ChangeKind = "add" | "remove" | "change" | "type";

export interface JsonChange {
  /** Canonical path of the value that differs. */
  path: string;
  kind: ChangeKind;
  /** Absent on `add`. */
  left?: unknown;
  /** Absent on `remove`. */
  right?: unknown;
}

const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function join(base: string, key: string | number) {
  return typeof key === "number" ? `${base}[${key}]` : `${base}['${key}']`;
}

/** What the UI labels a value as. Arrays and null are their own thing here. */
export function typeName(v: unknown): string {
  if (v === null) return "null";
  if (isArr(v)) return "array";
  return typeof v;
}

/** Stable spelling of a value, used to decide whether two array items are the
 *  same item. Keys are sorted so that reordering alone never counts. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (isArr(v)) return `[${v.map(canonical).join(",")}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
}

/**
 * Index pairs of array items that are identical, longest such run first.
 *
 * Straight index-by-index comparison is what most JSON diff tools do, and it
 * turns one item inserted at the front into "every item changed". Anchoring on
 * the items that did not move keeps the report the size of the actual edit.
 */
function anchors(a: unknown[], b: unknown[]): [number, number][] {
  const ca = a.map(canonical);
  const cb = b.map(canonical);
  const lcs: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = ca[i] === cb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (ca[i] === cb[j]) {
      out.push([i, j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/** Beyond this the report stops being something a person reads. */
const MAX_CHANGES = 2000;
/** Arrays longer than this skip the anchor table and compare by index. */
const ANCHOR_LIMIT = 500;

export function diffJson(a: unknown, b: unknown): JsonChange[] {
  const out: JsonChange[] = [];
  walk(a, b, "$", out);
  return out;
}

function walk(a: unknown, b: unknown, path: string, out: JsonChange[]): void {
  if (out.length >= MAX_CHANGES) return;

  const ta = typeName(a);
  const tb = typeName(b);
  if (ta !== tb) {
    out.push({ path, kind: "type", left: a, right: b });
    return;
  }

  if (isObj(a) && isObj(b)) {
    // Union of keys in left-then-new-right order, so the report reads in the
    // order of the document the user started from.
    const keys = [...Object.keys(a), ...Object.keys(b).filter((k) => !(k in a))];
    for (const k of keys) {
      const p = join(path, k);
      if (!(k in b)) out.push({ path: p, kind: "remove", left: a[k] });
      else if (!(k in a)) out.push({ path: p, kind: "add", right: b[k] });
      else walk(a[k], b[k], p, out);
      if (out.length >= MAX_CHANGES) return;
    }
    return;
  }

  if (isArr(a) && isArr(b)) {
    walkArray(a, b, path, out);
    return;
  }

  // Primitives. NaN cannot appear in parsed JSON, so === is enough, and -0
  // versus 0 is a distinction no API means to make.
  if (a !== b) out.push({ path, kind: "change", left: a, right: b });
}

function walkArray(a: unknown[], b: unknown[], path: string, out: JsonChange[]): void {
  // No anchors past the limit: the segment walk below then pairs everything
  // positionally, which is plain index-by-index comparison. Still correct,
  // just no longer clever about an item inserted in the middle.
  const pairs =
    a.length > ANCHOR_LIMIT || b.length > ANCHOR_LIMIT ? [] : anchors(a, b);

  let i = 0;
  let j = 0;
  const segment = (endA: number, endB: number) => {
    // Items between two anchors: pair them positionally so an item that was
    // edited reads as edits inside it rather than as a delete plus an add.
    // Whatever is left over on either side really was added or removed.
    while (i < endA && j < endB) {
      walk(a[i], b[j], join(path, i), out);
      i++;
      j++;
    }
    while (i < endA) out.push({ path: join(path, i), kind: "remove", left: a[i++] });
    while (j < endB) out.push({ path: join(path, j), kind: "add", right: b[j++] });
  };

  for (const [ai, bj] of pairs) {
    segment(ai, bj);
    // The anchor itself is identical by construction.
    i = ai + 1;
    j = bj + 1;
    if (out.length >= MAX_CHANGES) return;
  }
  segment(a.length, b.length);
}

/**
 * Narrow a report to one part of the document.
 *
 * Two rules, because two things get typed here. A query starting with `$` is a
 * **subtree**: paths equal to it or below it, and nothing else — `$['a']` must
 * not drag in `$['ab']`, which a plain "starts with" would. Anything else is
 * treated as a fragment of the path, so typing a key name finds it at whatever
 * depth it lives.
 */
export function filterByPath(changes: JsonChange[], query: string): JsonChange[] {
  const q = query.trim();
  if (!q) return changes;
  if (!q.startsWith("$")) return changes.filter((c) => c.path.includes(q));
  return changes.filter((c) => c.path === q || c.path.startsWith(q + "[") || q === "$");
}

/** One-line rendering of a value for the change list. */
export function preview(v: unknown, max = 80): string {
  if (v === undefined) return "";
  let s: string;
  try {
    s = JSON.stringify(v) ?? String(v);
  } catch {
    s = String(v);
  }
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export interface JsonDiffSummary {
  changes: JsonChange[];
  added: number;
  removed: number;
  changed: number;
  truncated: boolean;
}

export function summarise(changes: JsonChange[]): JsonDiffSummary {
  return {
    changes,
    added: changes.filter((c) => c.kind === "add").length,
    removed: changes.filter((c) => c.kind === "remove").length,
    changed: changes.filter((c) => c.kind === "change" || c.kind === "type").length,
    truncated: changes.length >= MAX_CHANGES,
  };
}
