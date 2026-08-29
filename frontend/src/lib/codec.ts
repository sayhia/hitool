/**
 * Encoding helpers shared by the Base64 / URL / JWT tools. All of them are
 * UTF-8 correct: `btoa` alone mangles anything outside Latin-1, which is most
 * of what this app's users paste.
 */

export function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToUtf8(b64: string): string {
  const clean = b64.trim().replace(/\s+/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** base64url ⇄ base64: JWTs and many APIs use the URL-safe alphabet. */
export function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(b64url: string): string {
  const s = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return s + "=".repeat((4 - (s.length % 4)) % 4);
}

export function isProbablyBase64(s: string): boolean {
  const t = s.trim().replace(/\s+/g, "");
  return t.length > 0 && t.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(t);
}

// ---------------- URL ----------------

export interface QueryParam {
  key: string;
  value: string;
}

/** Split a URL or bare query string into its parts. */
export function parseQuery(input: string): {
  base: string;
  params: QueryParam[];
  hash: string;
  error: string;
} {
  const raw = input.trim();
  if (!raw) return { base: "", params: [], hash: "", error: "" };

  let work = raw;
  let hash = "";
  const hashAt = work.indexOf("#");
  if (hashAt >= 0) {
    hash = work.slice(hashAt + 1);
    work = work.slice(0, hashAt);
  }

  let base = "";
  const qAt = work.indexOf("?");
  if (qAt >= 0) {
    base = work.slice(0, qAt);
    work = work.slice(qAt + 1);
  } else if (/^[a-zA-Z][\w+.-]*:\/\//.test(work) || work.includes("/")) {
    // Looks like a URL with no query at all.
    base = work;
    work = "";
  }

  const params: QueryParam[] = [];
  for (const pair of work.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = eq >= 0 ? pair.slice(0, eq) : pair;
    const v = eq >= 0 ? pair.slice(eq + 1) : "";
    params.push({ key: safeDecode(k), value: safeDecode(v) });
  }
  return { base, params, hash, error: "" };
}

/** decodeURIComponent throws on a stray %; show the raw text instead. */
export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

export function buildQuery(base: string, params: QueryParam[], hash: string): string {
  const qs = params
    .filter((p) => p.key)
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join("&");
  let out = base;
  if (qs) out += (base.includes("?") ? "&" : "?") + qs;
  if (hash) out += "#" + hash;
  return out;
}

// ---------------- JWT ----------------

export interface JwtPart {
  raw: string;
  json: string;
  error: string;
}

export interface JwtInfo {
  header: JwtPart;
  payload: JwtPart;
  signature: string;
  error: string;
  /** Well-known registered claims, resolved to something readable. */
  claims: { key: string; label: string; value: string; expired?: boolean }[];
}

const CLAIM_LABELS: Record<string, string> = {
  iss: "Issuer",
  sub: "Subject",
  aud: "Audience",
  exp: "Expires",
  nbf: "Not before",
  iat: "Issued at",
  jti: "JWT ID",
};

function decodePart(part: string): JwtPart {
  try {
    const json = base64ToUtf8(fromBase64Url(part));
    return { raw: part, json: JSON.stringify(JSON.parse(json), null, 2), error: "" };
  } catch (e) {
    return { raw: part, json: "", error: (e as Error).message };
  }
}

export function decodeJwt(token: string, now = new Date()): JwtInfo {
  const t = token.trim();
  const empty: JwtInfo = {
    header: { raw: "", json: "", error: "" },
    payload: { raw: "", json: "", error: "" },
    signature: "",
    error: "",
    claims: [],
  };
  if (!t) return empty;

  const parts = t.split(".");
  if (parts.length !== 3) {
    return { ...empty, error: `A JWT has three dot-separated parts; got ${parts.length}` };
  }

  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  const info: JwtInfo = { header, payload, signature: parts[2], error: "", claims: [] };

  if (payload.json) {
    // `json` is the output of JSON.stringify, so parsing it back cannot fail.
    // What it can be is a non-object: RFC 7519 says the payload is a JSON
    // object, but this is the tool people reach for *because* a token looks
    // wrong. `"iss" in null` is a TypeError, and thrown from the computed
    // that calls this it would take the whole view down — so anything that
    // isn't a plain object simply carries no claims.
    const parsed: unknown = JSON.parse(payload.json);
    const obj: Record<string, unknown> =
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    for (const [k, label] of Object.entries(CLAIM_LABELS)) {
      if (!(k in obj)) continue;
      const v = obj[k];
      if ((k === "exp" || k === "iat" || k === "nbf") && typeof v === "number") {
        const d = new Date(v * 1000);
        // Only `exp` can be expired; tagging `iat`/`nbf` with expired:false
        // would invite the UI to draw a validity badge that means nothing.
        const claim: { key: string; label: string; value: string; expired?: boolean } = {
          key: k,
          label,
          value: d.toLocaleString(),
        };
        if (k === "exp") claim.expired = d.getTime() < now.getTime();
        info.claims.push(claim);
      } else {
        info.claims.push({ key: k, label, value: String(v) });
      }
    }
  }
  return info;
}

// ---------------- radix ----------------

export const RADIXES = [
  { base: 2, label: "BIN", group: 4 },
  { base: 8, label: "OCT", group: 3 },
  { base: 10, label: "DEC", group: 3 },
  { base: 16, label: "HEX", group: 4 },
] as const;

/** Parse a value written in `base`; returns null when it has stray digits. */
export function parseRadix(text: string, base: number): bigint | null {
  const t = text.trim().replace(/[\s_]/g, "").toLowerCase();
  if (!t) return null;
  const neg = t.startsWith("-");
  const body = neg ? t.slice(1) : t;
  if (!body) return null;

  const digits = "0123456789abcdefghijklmnopqrstuvwxyz".slice(0, base);
  let n = 0n;
  for (const ch of body) {
    const d = digits.indexOf(ch);
    if (d < 0) return null;
    n = n * BigInt(base) + BigInt(d);
  }
  return neg ? -n : n;
}

export function formatRadix(n: bigint, base: number, group = 0): string {
  const s = n.toString(base).toUpperCase();
  if (!group) return s;
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  // Group from the right so the least-significant digits stay aligned.
  const chunks: string[] = [];
  for (let i = body.length; i > 0; i -= group) {
    chunks.unshift(body.slice(Math.max(0, i - group), i));
  }
  return (neg ? "-" : "") + chunks.join(" ");
}
