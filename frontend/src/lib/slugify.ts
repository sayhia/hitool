export type SlugOpts = {
  sep?: string;
  lower?: boolean;
  max?: number;
};

/** URL-safe slug: NFKD, drop marks, keep letters/digits, collapse the rest. */
export function slugify(input: string, opts: SlugOpts = {}): string {
  const sep = opts.sep && opts.sep.length ? opts.sep[0]! : "-";
  const max = Math.max(1, Math.min(opts.max ?? 80, 200));
  let s = input.normalize("NFKD").replace(/\p{M}+/gu, "");
  if (opts.lower !== false) s = s.toLowerCase();
  const kept: string[] = [];
  for (const ch of s) {
    if (/[0-9A-Za-z\u4e00-\u9fff]/.test(ch)) kept.push(ch);
    else kept.push(sep);
  }
  s = kept.join("").replace(new RegExp(`${escapeRe(sep)}{2,}`, "g"), sep);
  s = s.replace(new RegExp(`^${escapeRe(sep)}+|${escapeRe(sep)}+$`, "g"), "");
  if (s.length > max) {
    s = s.slice(0, max);
    s = s.replace(new RegExp(`${escapeRe(sep)}+$`), "");
  }
  return s;
}

/** Strip characters that are illegal in Windows/macOS filenames. */
export function sanitizeFilename(input: string): string {
  const s = input.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/^[. ]+|[. ]+$/g, "");
  return s || "untitled";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
