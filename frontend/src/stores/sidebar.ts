/**
 * Two-tier sidebar: collapsed it is a 72px icon rail, expanded it lists
 * home, favorites, categories, and (while a tool is open) that category's
 * sibling tools. The open/closed state persists so the app comes back
 * the way it was left.
 */
import { ref } from "vue";
import * as StoreService from "@bindings/hitool/services/storeservice";
import { inWails } from "../lib/backend";

const KEY = "layout.sidebar";

export const sidebarOpen = ref(true);

export function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
  persist();
}

export function setSidebar(open: boolean) {
  if (sidebarOpen.value === open) return;
  sidebarOpen.value = open;
  persist();
}

function persist() {
  const v = sidebarOpen.value ? "1" : "0";
  try {
    if (inWails()) void StoreService.SetSetting(KEY, v);
    else localStorage.setItem(KEY, v);
  } catch {
    /* persistence is best-effort */
  }
}

export async function initSidebar() {
  let saved = "";
  try {
    saved = inWails()
      ? await StoreService.GetSetting(KEY)
      : localStorage.getItem(KEY) || "";
  } catch {
    /* fall through to default */
  }
  // Unset keeps the expanded default; only an explicit "0" collapses.
  sidebarOpen.value = saved !== "0";
}
