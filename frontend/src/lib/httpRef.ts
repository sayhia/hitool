/**
 * The lookups a developer interrupts themselves for: status codes, common
 * headers and MIME types.
 *
 * A reference is only worth having if it says the thing you actually needed to
 * know, so each status carries the note that decides an argument — whether the
 * method may change on a redirect, whether the body is allowed, which code to
 * use for "logged in but not allowed".
 */

export interface StatusEntry {
  code: number;
  name: string;
  /** Localisation key suffix; the note itself lives in the locale files. */
  key: string;
}

export interface RefEntry {
  name: string;
  key: string;
}

export interface MimeEntry {
  ext: string;
  mime: string;
}

export const STATUSES: StatusEntry[] = [
  { code: 100, name: "Continue", key: "s100" },
  { code: 101, name: "Switching Protocols", key: "s101" },
  { code: 200, name: "OK", key: "s200" },
  { code: 201, name: "Created", key: "s201" },
  { code: 202, name: "Accepted", key: "s202" },
  { code: 204, name: "No Content", key: "s204" },
  { code: 206, name: "Partial Content", key: "s206" },
  { code: 301, name: "Moved Permanently", key: "s301" },
  { code: 302, name: "Found", key: "s302" },
  { code: 303, name: "See Other", key: "s303" },
  { code: 304, name: "Not Modified", key: "s304" },
  { code: 307, name: "Temporary Redirect", key: "s307" },
  { code: 308, name: "Permanent Redirect", key: "s308" },
  { code: 400, name: "Bad Request", key: "s400" },
  { code: 401, name: "Unauthorized", key: "s401" },
  { code: 403, name: "Forbidden", key: "s403" },
  { code: 404, name: "Not Found", key: "s404" },
  { code: 405, name: "Method Not Allowed", key: "s405" },
  { code: 409, name: "Conflict", key: "s409" },
  { code: 410, name: "Gone", key: "s410" },
  { code: 412, name: "Precondition Failed", key: "s412" },
  { code: 413, name: "Payload Too Large", key: "s413" },
  { code: 415, name: "Unsupported Media Type", key: "s415" },
  { code: 422, name: "Unprocessable Content", key: "s422" },
  { code: 428, name: "Precondition Required", key: "s428" },
  { code: 429, name: "Too Many Requests", key: "s429" },
  { code: 500, name: "Internal Server Error", key: "s500" },
  { code: 501, name: "Not Implemented", key: "s501" },
  { code: 502, name: "Bad Gateway", key: "s502" },
  { code: 503, name: "Service Unavailable", key: "s503" },
  { code: 504, name: "Gateway Timeout", key: "s504" },
];

export const HEADERS: RefEntry[] = [
  { name: "Accept", key: "hAccept" },
  { name: "Authorization", key: "hAuthorization" },
  { name: "Cache-Control", key: "hCacheControl" },
  { name: "Content-Disposition", key: "hContentDisposition" },
  { name: "Content-Encoding", key: "hContentEncoding" },
  { name: "Content-Type", key: "hContentType" },
  { name: "ETag", key: "hETag" },
  { name: "If-None-Match", key: "hIfNoneMatch" },
  { name: "Location", key: "hLocation" },
  { name: "Range", key: "hRange" },
  { name: "Retry-After", key: "hRetryAfter" },
  { name: "Set-Cookie", key: "hSetCookie" },
  { name: "Vary", key: "hVary" },
  { name: "X-Forwarded-For", key: "hXff" },
  { name: "Access-Control-Allow-Origin", key: "hCors" },
];

export const MIMES: MimeEntry[] = [
  { ext: "json", mime: "application/json" },
  { ext: "html", mime: "text/html" },
  { ext: "css", mime: "text/css" },
  { ext: "js", mime: "text/javascript" },
  { ext: "mjs", mime: "text/javascript" },
  { ext: "txt", mime: "text/plain" },
  { ext: "csv", mime: "text/csv" },
  { ext: "xml", mime: "application/xml" },
  { ext: "yaml", mime: "application/yaml" },
  { ext: "pdf", mime: "application/pdf" },
  { ext: "zip", mime: "application/zip" },
  { ext: "gz", mime: "application/gzip" },
  { ext: "tar", mime: "application/x-tar" },
  { ext: "png", mime: "image/png" },
  { ext: "jpg", mime: "image/jpeg" },
  { ext: "jpeg", mime: "image/jpeg" },
  { ext: "gif", mime: "image/gif" },
  { ext: "webp", mime: "image/webp" },
  { ext: "avif", mime: "image/avif" },
  { ext: "svg", mime: "image/svg+xml" },
  { ext: "ico", mime: "image/vnd.microsoft.icon" },
  { ext: "bmp", mime: "image/bmp" },
  { ext: "tiff", mime: "image/tiff" },
  { ext: "heic", mime: "image/heic" },
  { ext: "mp3", mime: "audio/mpeg" },
  { ext: "wav", mime: "audio/wav" },
  { ext: "flac", mime: "audio/flac" },
  { ext: "ogg", mime: "audio/ogg" },
  { ext: "m4a", mime: "audio/mp4" },
  { ext: "mp4", mime: "video/mp4" },
  { ext: "webm", mime: "video/webm" },
  { ext: "mov", mime: "video/quicktime" },
  { ext: "mkv", mime: "video/x-matroska" },
  { ext: "woff2", mime: "font/woff2" },
  { ext: "ttf", mime: "font/ttf" },
  { ext: "otf", mime: "font/otf" },
  { ext: "wasm", mime: "application/wasm" },
  { ext: "bin", mime: "application/octet-stream" },
];

export type StatusClass = "1xx" | "2xx" | "3xx" | "4xx" | "5xx";

export function statusClass(code: number): StatusClass {
  const n = Math.floor(code / 100);
  // Only 1xx–5xx exist; anything else is a made-up code, and calling it 5xx
  // is closer to the truth than inventing a class the UI has no colour for.
  return n >= 1 && n <= 5 ? (`${n}xx` as StatusClass) : "5xx";
}

/**
 * Filter a reference list.
 *
 * The query is matched against everything the row shows *and* against the
 * localised note, because "which one means logged in but not allowed" is the
 * question people actually arrive with — matching only the name would answer
 * it with nothing.
 */
export function searchStatuses(
  query: string,
  note: (key: string) => string,
): StatusEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return STATUSES;
  return STATUSES.filter(
    (s) =>
      String(s.code).includes(q) ||
      s.name.toLowerCase().includes(q) ||
      note(s.key).toLowerCase().includes(q),
  );
}

export function searchHeaders(query: string, note: (key: string) => string): RefEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return HEADERS;
  return HEADERS.filter(
    (h) => h.name.toLowerCase().includes(q) || note(h.key).toLowerCase().includes(q),
  );
}

export function searchMimes(query: string): MimeEntry[] {
  const q = query.trim().toLowerCase().replace(/^\./, "");
  if (!q) return MIMES;
  return MIMES.filter((m) => m.ext.includes(q) || m.mime.toLowerCase().includes(q));
}

/** The MIME type for a file name or extension, or "" when it is not listed. */
export function mimeFor(nameOrExt: string): string {
  const ext = nameOrExt.toLowerCase().split(/[\\/]/).pop()!.split(".").pop()!;
  return MIMES.find((m) => m.ext === ext)?.mime ?? "";
}
