/**
 * Transient notifications. Actions that succeed silently (copy, save, export)
 * need an acknowledgement that isn't tied to the button that triggered them.
 */
import { ref } from "vue";
import { t } from "../lib/i18n";

export type ToastKind = "ok" | "fail" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

export const toasts = ref<Toast[]>([]);

let seq = 0;

export function toast(text: string, kind: ToastKind = "ok", ms = 2200) {
  const id = ++seq;
  toasts.value = [...toasts.value, { id, kind, text }];
  setTimeout(() => dismiss(id), ms);
  return id;
}

export function dismiss(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

/**
 * The one place that talks to the clipboard. A write can be refused — no
 * permission, no secure context — and an unhandled rejection would leave the
 * button claiming success, so failure is always reported and always returned.
 *
 * Success stays silent here: callers that acknowledge it with a label on the
 * button itself don't want a toast saying the same thing twice.
 */
export async function writeClipboard(text: string, failMsg = t("common.copyFailed")) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    toast(failMsg, "fail");
    return false;
  }
}

/** Copy helper that reports its own outcome. */
export async function copyText(text: string, okMsg: string, failMsg = t("common.copyFailed")) {
  if (!(await writeClipboard(text, failMsg))) return false;
  toast(okMsg, "ok");
  return true;
}
