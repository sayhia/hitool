/**
 * The tool tree lives in a permanent sidebar beside the content. It can be
 * collapsed (⌘B or the strip's reveal button) and the state persists so the
 * app comes back the way it was left.
 */
import { ref } from "vue";
import * as StoreService from "@bindings/hitool/services/storeservice";
import { inWails } from "../lib/backend";

const KEY = "layout.sidebar";

export const sidebarOpen = ref(true);

/** Category the number keys asked the tree to reveal ("" = none). */
export const focusedCat = ref("");

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
