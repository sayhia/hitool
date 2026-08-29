/**
 * A pragmatic SQL pretty-printer.
 *
 * Not a parser — it tokenizes (strings, comments, words, punctuation) and
 * reflows: major clause keywords start their own line, AND/OR indent beneath
 * the clause, commas separate with a breath of space. Strings and comments
 * pass through untouched, which is what keeps the formatter safe to run on
 * queries it doesn't fully understand.
 */

export interface SqlOptions {
  /** Uppercase keywords; defaults to true. */
  uppercase?: boolean;
  /** Spaces per indent level; defaults to 2. */
  indent?: number;
}

interface Token {
  type: "word" | "string" | "num" | "comma" | "lparen" | "rparen" | "comment" | "op";
  text: string;
}

/** Clause keywords that start a new line at zero indent. */
const MAJOR = new Set([
  "select", "from", "where", "group", "having", "order", "limit", "offset",
  "union", "intersect", "except", "values", "set", "insert", "update",
  "delete", "create", "with", "returning",
]);

/** JOIN heads also start a new line. */
const JOINS = new Set(["join", "inner", "left", "right", "full", "cross", "outer"]);

/** Every word that counts as a keyword for casing purposes. */
const KEYWORDS = new Set([
  ...MAJOR,
  ...JOINS,
  "by", "on", "using", "as", "asc", "desc", "is", "not", "null", "in",
  "like", "between", "exists", "case", "when", "then", "else", "end",
  "and", "or", "distinct", "all", "any", "into", "key", "primary",
  "references", "table", "index", "view", "if", "default", "true", "false",
]);

export function tokenizeSql(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // Single-quoted strings, '' as an escaped quote.
    if (ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      tokens.push({ type: "string", text: sql.slice(i, Math.min(j + 1, n)) });
      i = j + 1;
      continue;
    }
    // Double-quoted identifiers and backticks ride along as strings.
    if (ch === '"' || ch === "`") {
      let j = i + 1;
      while (j < n && sql[j] !== ch) j++;
      tokens.push({ type: "string", text: sql.slice(i, Math.min(j + 1, n)) });
      i = j + 1;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      const j = sql.indexOf("\n", i);
      const end = j < 0 ? n : j;
      tokens.push({ type: "comment", text: sql.slice(i, end) });
      i = end;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      const j = sql.indexOf("*/", i + 2);
      const end = j < 0 ? n : j + 2;
      tokens.push({ type: "comment", text: sql.slice(i, end) });
      i = end;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(sql[i + 1] ?? ""))) {
      const m = /^\d*\.?\d+([eE][+-]?\d+)?/.exec(sql.slice(i));
      const len = m ? m[0].length : 1;
      tokens.push({ type: "num", text: sql.slice(i, i + len) });
      i += len;
      continue;
    }
    if (/[A-Za-z_$@#\u0080-\uffff]/.test(ch)) {
      const m = /^[A-Za-z0-9_$@#\u0080-\uffff]+/.exec(sql.slice(i));
      const len = m ? m[0].length : 1;
      tokens.push({ type: "word", text: sql.slice(i, i + len) });
      i += len;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma", text: "," });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen", text: "(" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen", text: ")" });
      i++;
      continue;
    }
    // Multi-char operators stick together (<=, <>, !=, ||).
    const two = sql.slice(i, i + 2);
    if (["<=", ">=", "<>", "!=", "||", "::", "->"].includes(two)) {
      tokens.push({ type: "op", text: two });
      i += 2;
      continue;
    }
    tokens.push({ type: "op", text: ch });
    i++;
  }
  return tokens;
}

export function formatSql(sql: string, opts: SqlOptions = {}): string {
  const upper = opts.uppercase ?? true;
  const pad = " ".repeat(opts.indent ?? 2);
  const tokens = tokenizeSql(sql);
  const lines: string[] = [];
  let cur: string[] = [];
  let lastWord = "";

  const flush = () => {
    if (cur.length) lines.push(cur.join(""));
    cur = [];
  };

  const shape = (w: string) =>
    KEYWORDS.has(w.toLowerCase()) ? (upper ? w.toUpperCase() : w.toLowerCase()) : w;

  for (const tk of tokens) {
    if (tk.type === "word") {
      const lower = tk.text.toLowerCase();
      // AND / OR drop to an indented line under the clause.
      if (lower === "and" || lower === "or") {
        flush();
        cur.push(pad + shape(tk.text) + " ");
        continue;
      }
      // "BY" belongs to the GROUP / ORDER line that introduced it, and
      // "JOIN" to its modifier ("INNER JOIN" reads as one clause).
      const joinsClause =
        (lower === "by" && (lastWord === "group" || lastWord === "order")) ||
        (lower === "join" && ["inner", "left", "right", "full", "cross", "outer"].includes(lastWord)) ||
        (lower === "outer" && ["left", "right", "full"].includes(lastWord));
      if ((MAJOR.has(lower) || JOINS.has(lower)) && !joinsClause && cur.length) flush();
      cur.push(cur.length && !/[(\s]$/.test(cur[cur.length - 1]) && cur[cur.length - 1] !== "(" ? " " : "");
      cur.push(shape(tk.text));
      lastWord = lower;
      continue;
    }
    lastWord = "";
    if (tk.type === "comment") {
      if (cur.length) cur.push(" ");
      cur.push(tk.text);
      continue;
    }
    if (tk.type === "comma") {
      cur.push(", ");
      continue;
    }
    if (tk.type === "lparen") {
      cur.push("(");
      continue;
    }
    if (tk.type === "rparen") {
      // "f(* )" reads wrong: drop the space an operator left behind.
      if (cur.length && cur[cur.length - 1] === " ") cur.pop();
      cur.push(")");
      continue;
    }
    if (tk.type === "op") {
      const noSpaceBefore = cur.length && [", ", "("].includes(cur[cur.length - 1]);
      if (!noSpaceBefore && cur.length && !cur[cur.length - 1].endsWith(" ")) cur.push(" ");
      cur.push(tk.text);
      if (tk.text !== ")" ) cur.push(" ");
      continue;
    }
    // Strings and numbers attach with the spacing already set.
    if (cur.length && !["", " ", "( ", ", "].includes(cur[cur.length - 1]) && !cur[cur.length - 1].endsWith(" ") && cur[cur.length - 1] !== "(") {
      cur.push(" ");
    }
    cur.push(tk.text);
  }
  flush();
  return lines.map((l) => l.trimEnd()).join("\n");
}
