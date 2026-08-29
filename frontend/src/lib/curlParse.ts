/**
 * Turn a pasted curl command into its structured request.
 *
 * Copied commands come from docs, chat logs and terminals, so the parser
 * tolerates line continuations, mixed quoting styles, and both short and
 * long flags. What it can't classify rides along in `other` instead of
 * being silently dropped.
 */

export interface CurlRequest {
  method: string;
  url: string;
  headers: { name: string; value: string }[];
  body: string;
  user: string;
  other: string[];
}

/** Split a shell-ish command line into tokens, honouring quotes and `\` continuations. */
export function tokenizeCurl(text: string): string[] {
  const src = text.replace(/\\\r?\n/g, " ");
  const tokens: string[] = [];
  let cur = "";
  let quote: "" | "'" | '"' = "";
  let started = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (quote === '"' && ch === "\\" && i + 1 < src.length) {
        const next = src[i + 1];
        // Inside double quotes the shell only honours a few escapes.
        if (next === '"' || next === "\\" || next === "$" || next === "`") {
          cur += next;
          i++;
          continue;
        }
        cur += ch;
        continue;
      }
      if (ch === quote) {
        quote = "";
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started || cur) {
        tokens.push(cur);
        cur = "";
        started = false;
      }
      continue;
    }
    if (ch === "\\" && i + 1 < src.length) {
      cur += src[++i];
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started || cur) tokens.push(cur);
  return tokens;
}

const HEADER_FLAGS = new Set(["-H", "--header"]);
const DATA_FLAGS = new Set(["-d", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode"]);
const METHOD_FLAGS = new Set(["-X", "--request"]);

export function parseCurl(text: string): CurlRequest {
  const tokens = tokenizeCurl(text);
  const out: CurlRequest = { method: "", url: "", headers: [], body: "", user: "", other: [] };
  const bodies: string[] = [];

  const take = (i: number, flag: string): [string, number] => {
    // curl accepts both "-H value" and "-Hvalue"; long flags need the space.
    if (flag.length === 2 && tokens[i].length > 2) return [tokens[i].slice(2), i];
    return [tokens[i + 1] ?? "", i + 1];
  };

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (i === 0 && (tk === "curl" || tk.endsWith("/curl"))) continue;

    if (HEADER_FLAGS.has(tk.slice(0, tk.startsWith("--") ? tk.length : 2))) {
      const [v, ni] = take(i, tk.startsWith("--") ? tk : tk.slice(0, 2));
      i = ni;
      const idx = v.indexOf(":");
      if (idx > 0) out.headers.push({ name: v.slice(0, idx).trim(), value: v.slice(idx + 1).trim() });
      continue;
    }
    if (tk === "-H" || tk === "--header") {
      const v = tokens[++i] ?? "";
      const idx = v.indexOf(":");
      if (idx > 0) out.headers.push({ name: v.slice(0, idx).trim(), value: v.slice(idx + 1).trim() });
      continue;
    }
    if (DATA_FLAGS.has(tk) || DATA_FLAGS.has(tk.slice(0, 2))) {
      const [v, ni] = take(i, DATA_FLAGS.has(tk) ? tk : tk.slice(0, 2));
      i = ni;
      bodies.push(v);
      continue;
    }
    if (METHOD_FLAGS.has(tk) || tk.startsWith("-X")) {
      const [v, ni] = take(i, tk.startsWith("--") ? tk : "-X");
      i = ni;
      out.method = v.toUpperCase();
      continue;
    }
    if (tk === "-u" || tk === "--user") {
      out.user = tokens[++i] ?? "";
      continue;
    }
    if (tk.startsWith("-")) {
      out.other.push(tk);
      // Flags known to take a value swallow their neighbour.
      if (["-A", "-e", "-o", "--url", "-F", "--form", "-b", "-c", "--cookie", "--cookie-jar"].includes(tk)) i++;
      continue;
    }
    if (!out.url) out.url = tk;
    else out.other.push(tk);
  }

  out.body = bodies.join("&");
  if (!out.method) out.method = bodies.length ? "POST" : "GET";
  return out;
}
