/**
 * Transient notifications. Actions that succeed silently (copy, save, export)
 * need an acknowledgement that isn't tied to the button that triggered them.
 */
import { ref } from "vue";

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

/** Copy helper that reports its own outcome. */
export async function copyText(text: string, okMsg: string, failMsg = "复制失败") {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg, "ok");
    return true;
  } catch {
    toast(failMsg, "fail");
    return false;
  }
}
