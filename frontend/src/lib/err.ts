/**
 * Turning a thrown value into something worth showing a user.
 *
 * Plain stringification was used everywhere before this, which has two failure
 * modes that both actually happen: an Error with a message stringifies to
 * "Error: <message>" — the prefix is noise in a banner — and an Error with an
 * empty message stringifies to the single word "Error", which tells nobody
 * anything. Wails rejects bridge calls with plain Errors, and an empty
 * message is exactly what a transport-level failure produces.
 *
 * Lives in its own module rather than in backend.ts because i18n imports
 * backend; going the other way would close a cycle.
 */
import { t } from "./i18n";

export function errText(e: unknown): string {
  if (e == null) return t("common.failed");
  if (typeof e === "string") return e.trim() || t("common.failed");

  if (e instanceof Error) {
    const msg = e.message?.trim();
    if (msg) return msg;
    // Named but empty: "RuntimeError" beats "Error", and both beat nothing.
    return e.name && e.name !== "Error" ? e.name : t("common.failed");
  }

  // Some rejections are plain objects carrying a message or error field.
  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    for (const k of ["message", "error", "detail"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }

  const s = `${e}`.trim();
  return s && s !== "[object Object]" ? s : t("common.failed");
}
