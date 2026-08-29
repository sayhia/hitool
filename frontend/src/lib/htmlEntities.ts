/** Named entities we round-trip. Everything else uses numeric references. */
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
  copy: "©",
  reg: "®",
  trade: "™",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  times: "×",
  divide: "÷",
};

const BY_CHAR: Record<string, string> = Object.fromEntries(
  Object.entries(NAMED).map(([k, v]) => [v, k]),
);

export function encodeHtml(input: string, numeric = false): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "&" || ch === "<" || ch === ">" || ch === '"' || ch === "'") {
      const name = BY_CHAR[ch];
      out += numeric || !name ? `&#${code};` : `&${name};`;
      continue;
    }
    if (code > 127) {
      const name = BY_CHAR[ch];
      out += !numeric && name ? `&${name};` : `&#${code};`;
      continue;
    }
    out += ch;
  }
  return out;
}

export function decodeHtml(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (full, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const n = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return full;
      try {
        return String.fromCodePoint(n);
      } catch {
        return full;
      }
    }
    return NAMED[body] ?? full;
  });
}
