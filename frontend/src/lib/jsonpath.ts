/**
 * A JSONPath subset, hand-written rather than pulled in as a dependency.
 *
 * The published libraries are either tiny and wrong on the recursive
 * descent cases, or large and drag in an expression evaluator that runs
 * arbitrary JavaScript — which is a poor trade for a local toolbox where the
 * input is somebody's API response.
 *
 * Supported:
 *   $                 root
 *   .name  ['name']   child (quotes let a key contain dots or spaces)
 *   [0] [-1]          index, negative counts from the end
 *   [1:4] [:3] [::2]  slice, Python semantics
 *   [*]  .*           wildcard
 *   ..name  ..[*]     recursive descent
 *   [a,b] [0,2]       union
 *   [?(@.k > 1)]      filter, with a fixed comparator grammar — no eval
 *
 * Deliberately not supported: script expressions `[(...)]`. They only exist
 * to run code, and there is nothing here worth running code for.
 */

export interface PathMatch {
  /** Normalised location, e.g. `$['items'][0]['id']`. */
  path: string;
  value: unknown;
}

export interface PathResult {
  matches: PathMatch[];
  error?: string;
}

type Step =
  | { kind: "child"; names: string[] }
  | { kind: "index"; indices: number[] }
  | { kind: "slice"; from?: number; to?: number; step: number }
  | { kind: "wild" }
  | { kind: "descend"; step: Step }
  | { kind: "filter"; lhs: string[]; op: string; rhs: unknown };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);

/** `$['a'][0]` — one canonical spelling so results can be copied and reused. */
function join(base: string, key: string | number) {
  return typeof key === "number" ? `${base}[${key}]` : `${base}['${key}']`;
}

// ---------------------------------------------------------------- parsing

function parseBracket(body: string): Step {
  const s = body.trim();

  if (s === "*") return { kind: "wild" };

  if (s.startsWith("?")) return parseFilter(s);

  // Slice — checked before index so `[:3]` isn't read as a name.
  if (s.includes(":")) {
    const parts = s.split(":");
    if (parts.length > 3) throw new Error(`bad slice: [${s}]`);
    const num = (t: string) => (t.trim() === "" ? undefined : Number(t));
    const [from, to, stepRaw] = [num(parts[0]), num(parts[1]), num(parts[2] ?? "")];
    if ([from, to, stepRaw].some((n) => n !== undefined && !Number.isInteger(n))) {
      throw new Error(`bad slice: [${s}]`);
    }
    const step = stepRaw ?? 1;
    if (step === 0) throw new Error("slice step cannot be 0");
    return { kind: "slice", from, to, step };
  }

  // Quoted names, possibly a union of them.
  if (/^['"]/.test(s)) {
    const names = splitTop(s).map((t) => {
      const q = t.trim();
      if (!/^(['"]).*\1$/.test(q)) throw new Error(`unterminated quote: ${q}`);
      return q.slice(1, -1);
    });
    return { kind: "child", names };
  }

  // Indices, possibly a union.
  const parts = splitTop(s);
  if (parts.every((p) => /^-?\d+$/.test(p.trim()))) {
    return { kind: "index", indices: parts.map((p) => Number(p.trim())) };
  }

  // Bare names inside brackets are tolerated: people write [name] a lot.
  return { kind: "child", names: parts.map((p) => p.trim()) };
}

/** Split on commas that are not inside quotes. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote = "";
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = "";
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const OPS = ["<=", ">=", "==", "!=", "=~", "<", ">"];

function parseFilter(s: string): Step {
  // `?(@.price < 10)` or `?(@.name == 'x')`; the parens are optional.
  let body = s.slice(1).trim();
  if (body.startsWith("(") && body.endsWith(")")) body = body.slice(1, -1).trim();

  const op = OPS.find((o) => body.includes(o));
  if (!op) {
    // Existence test: `?(@.discount)`.
    const lhs = fieldPath(body);
    return { kind: "filter", lhs, op: "exists", rhs: null };
  }
  const at = body.indexOf(op);
  const lhs = fieldPath(body.slice(0, at));
  const rhs = literal(body.slice(at + op.length));
  return { kind: "filter", lhs, op, rhs };
}

/** `@.a.b` / `@['a']['b']` / `@` → ["a","b"] / []. */
function fieldPath(raw: string): string[] {
  const t = raw.trim().replace(/^@/, "");
  if (!t) return [];
  return [...t.matchAll(/\.([A-Za-z_$][\w$]*)|\[\s*['"]([^'"]+)['"]\s*\]/g)].map(
    (m) => m[1] ?? m[2],
  );
}

function literal(raw: string): unknown {
  const t = raw.trim();
  if (/^(['"]).*\1$/.test(t)) return t.slice(1, -1);
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  const n = Number(t);
  if (t !== "" && !Number.isNaN(n)) return n;
  return t;
}

function parse(expr: string): Step[] {
  let s = expr.trim();
  if (!s) throw new Error("empty expression");
  if (s === "$") return [];
  if (s.startsWith("$")) s = s.slice(1);
  else if (!s.startsWith(".") && !s.startsWith("[")) s = "." + s; // tolerate `items[0]`

  const steps: Step[] = [];
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("..", i)) {
      i += 2;
      if (s[i] === "[") {
        const end = closing(s, i);
        steps.push({ kind: "descend", step: parseBracket(s.slice(i + 1, end)) });
        i = end + 1;
      } else if (s[i] === "*") {
        steps.push({ kind: "descend", step: { kind: "wild" } });
        i += 1;
      } else {
        const m = /^[^.[]+/.exec(s.slice(i));
        if (!m) throw new Error("`..` must be followed by a name, * or [");
        steps.push({ kind: "descend", step: { kind: "child", names: [m[0]] } });
        i += m[0].length;
      }
    } else if (s[i] === ".") {
      i += 1;
      if (s[i] === "*") {
        steps.push({ kind: "wild" });
        i += 1;
      } else {
        const m = /^[^.[]+/.exec(s.slice(i));
        if (!m) throw new Error("`.` must be followed by a name or *");
        steps.push({ kind: "child", names: [m[0]] });
        i += m[0].length;
      }
    } else if (s[i] === "[") {
      const end = closing(s, i);
      steps.push(parseBracket(s.slice(i + 1, end)));
      i = end + 1;
    } else {
      throw new Error(`unexpected \`${s[i]}\` at ${i}`);
    }
  }
  return steps;
}

/** Index of the `]` closing the `[` at `open`, quotes respected. */
function closing(s: string, open: number): number {
  let quote = "";
  for (let i = open + 1; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === "]") {
      return i;
    }
  }
  throw new Error("unbalanced [");
}

// ------------------------------------------------------------- evaluation

function compare(a: unknown, op: string, b: unknown): boolean {
  switch (op) {
    case "exists":
      return a !== undefined;
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    case "=~":
      try {
        return typeof a === "string" && new RegExp(String(b)).test(a);
      } catch {
        return false;
      }
    default: {
      // Ordering only makes sense between two numbers or two strings.
      if (typeof a === "number" && typeof b === "number") {
        return op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b : a >= b;
      }
      if (typeof a === "string" && typeof b === "string") {
        return op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b : a >= b;
      }
      return false;
    }
  }
}

function dig(value: unknown, path: string[]): unknown {
  let cur = value;
  for (const k of path) {
    if (!isObj(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

/**
 * Every descendant of `m`, `m` itself first, in document order.
 *
 * Depth-first, not breadth-first: `$..price` must report the prices inside
 * `book[*]` before a shallower `bicycle.price`, because that is the order
 * they appear in the document. A level-by-level walk reverses those two.
 */
function descendants(m: PathMatch): PathMatch[] {
  const out: PathMatch[] = [];
  const visit = ({ path, value }: PathMatch) => {
    out.push({ path, value });
    if (isArr(value)) {
      value.forEach((v, i) => visit({ path: join(path, i), value: v }));
    } else if (isObj(value)) {
      for (const [k, v] of Object.entries(value)) visit({ path: join(path, k), value: v });
    }
  };
  visit(m);
  return out;
}

function applyStep(input: PathMatch[], step: Step): PathMatch[] {
  const out: PathMatch[] = [];

  for (const m of input) {
    switch (step.kind) {
      case "child":
        for (const name of step.names) {
          if (isObj(m.value) && name in m.value) {
            out.push({ path: join(m.path, name), value: m.value[name] });
          }
        }
        break;

      case "index":
        if (isArr(m.value)) {
          for (const raw of step.indices) {
            const i = raw < 0 ? m.value.length + raw : raw;
            if (i >= 0 && i < m.value.length) {
              out.push({ path: join(m.path, i), value: m.value[i] });
            }
          }
        }
        break;

      case "slice":
        if (isArr(m.value)) {
          const n = m.value.length;
          const norm = (v: number | undefined, dflt: number) => {
            if (v === undefined) return dflt;
            return v < 0 ? Math.max(0, n + v) : Math.min(v, n);
          };
          if (step.step > 0) {
            for (let i = norm(step.from, 0); i < norm(step.to, n); i += step.step) {
              out.push({ path: join(m.path, i), value: m.value[i] });
            }
          } else {
            for (let i = norm(step.from, n - 1); i > norm(step.to, -1); i += step.step) {
              if (i >= 0 && i < n) out.push({ path: join(m.path, i), value: m.value[i] });
            }
          }
        }
        break;

      case "wild":
        if (isArr(m.value)) {
          m.value.forEach((v, i) => out.push({ path: join(m.path, i), value: v }));
        } else if (isObj(m.value)) {
          for (const [k, v] of Object.entries(m.value)) {
            out.push({ path: join(m.path, k), value: v });
          }
        }
        break;

      case "descend":
        // The inner step is tried at every depth, root included.
        out.push(...applyStep(descendants(m), step.step));
        break;

      case "filter": {
        const kids = isArr(m.value)
          ? m.value.map((v, i) => ({ path: join(m.path, i), value: v }))
          : isObj(m.value)
            ? Object.entries(m.value).map(([k, v]) => ({ path: join(m.path, k), value: v }))
            : [];
        for (const kid of kids) {
          if (compare(dig(kid.value, step.lhs), step.op, step.rhs)) out.push(kid);
        }
        break;
      }
    }
  }

  // A recursive descent can reach the same node by more than one route.
  const seen = new Set<string>();
  return out.filter((m) => !seen.has(m.path) && seen.add(m.path));
}

/** Run `expr` against `data`. Never throws — a bad expression comes back as `error`. */
export function query(data: unknown, expr: string): PathResult {
  let steps: Step[];
  try {
    steps = parse(expr);
  } catch (e) {
    return { matches: [], error: e instanceof Error ? e.message : String(e) };
  }

  let cur: PathMatch[] = [{ path: "$", value: data }];
  for (const step of steps) {
    cur = applyStep(cur, step);
    if (!cur.length) break;
  }
  return { matches: cur };
}

/** A short, one-line rendering of a value for the results list. */
export function preview(v: unknown, max = 90): string {
  let s: string;
  if (typeof v === "string") s = JSON.stringify(v);
  else if (v === undefined) s = "undefined";
  else s = JSON.stringify(v) ?? String(v);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
