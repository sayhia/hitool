/**
 * Open-tool tabs. A tab is a live workspace: navigating between tabs keeps
 * each tool mounted (see KeepAlive in AppShell), so state survives switching.
 */
import { computed, ref } from "vue";
import type { Router } from "vue-router";
import { canonicalToolId, toolById, toolIdOfPath } from "../lib/tools";
import { t } from "../lib/i18n";
import { inWails } from "../lib/backend";
import * as StoreService from "@bindings/hitool/services/storeservice";

export interface Tab {
  /** Route path, also the identity — one tab per tool. */
  path: string;
  toolId: string;
  icon: string;
  pinned: boolean;
}

const tabs = ref<Tab[]>([]);
const activePath = ref("");

export function useTabs() {
  return { tabs, activePath };
}

export function tabTitle(tab: Tab): string {
  return t(`tools.${tab.toolId}.name`);
}

/** Called by the router afterEach — the single place tabs are created. */
export function syncFromRoute(path: string) {
  activePath.value = path;
  // Tools only; the launcher, category pages and settings are not tabbed.
  const raw = toolIdOfPath(path);
  if (!raw) return;
  const toolId = canonicalToolId(raw);
  const canonPath = `/t/${toolId}`;
  if (tabs.value.some((x) => x.path === canonPath)) return;
  const def = toolById(toolId);
  tabs.value = [
    ...tabs.value,
    { path: canonPath, toolId, icon: def?.icon ?? "Box", pinned: false },
  ];
}

export function closeTab(path: string, router: Router) {
  const idx = tabs.value.findIndex((x) => x.path === path);
  if (idx === -1) return;
  const wasActive = activePath.value === path;
  tabs.value = tabs.value.filter((x) => x.path !== path);

  if (!wasActive) return;
  // Fall back to the neighbour on the left, then the right, then the launcher.
  const next = tabs.value[idx - 1] ?? tabs.value[idx] ?? null;
  router.push(next ? next.path : "/");
}

export function closeOthers(path: string, router: Router) {
  tabs.value = tabs.value.filter((x) => x.path === path || x.pinned);
  router.push(path);
}

export function closeAll(router: Router) {
  tabs.value = tabs.value.filter((x) => x.pinned);
  router.push(tabs.value[0]?.path ?? "/");
}

export function togglePin(path: string) {
  tabs.value = tabs.value.map((x) => (x.path === path ? { ...x, pinned: !x.pinned } : x));
  // Pinned tabs collect on the left so their position stays predictable.
  tabs.value = [
    ...tabs.value.filter((x) => x.pinned),
    ...tabs.value.filter((x) => !x.pinned),
  ];
}

/** Move a tab to a new index (drag reorder). */
export function moveTab(from: number, to: number) {
  const list = [...tabs.value];
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  tabs.value = list;
}

/** Cycle to the next/previous tab — ⌘⌥→ / ⌘⌥← */
export function cycleTab(delta: number, router: Router) {
  if (tabs.value.length < 2) return;
  const idx = tabs.value.findIndex((x) => x.path === activePath.value);
  if (idx === -1) {
    router.push(tabs.value[0].path);
    return;
  }
  const next = (idx + delta + tabs.value.length) % tabs.value.length;
  router.push(tabs.value[next].path);
}

/** Jump to the tab at index (0-based) — ⌘1…⌘9 */
export function activateAt(index: number, router: Router) {
  const tab = tabs.value[index];
  if (tab) router.push(tab.path);
}

/** Close the currently active tab — ⌘W */
export function closeActive(router: Router) {
  if (!activePath.value) return;
  closeTab(activePath.value, router);
}

export const hasTabs = computed(() => tabs.value.length > 0);

// ---- persistence ----
// The session's tabs survive a restart; the app opens on the launcher with
// the previous tabs docked in the strip, ready to be picked back up.

const TABS_KEY = "layout.tabs";

interface StoredTab {
  path: string;
  pinned: boolean;
}

export async function restoreTabs() {
  let raw = "";
  try {
    raw = inWails()
      ? await StoreService.GetSetting(TABS_KEY)
      : localStorage.getItem(TABS_KEY) || "";
  } catch {
    return;
  }
  if (!raw) return;
  let stored: StoredTab[];
  try {
    stored = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(stored)) return;
  const restored: Tab[] = [];
  for (const s of stored) {
    const raw = typeof s?.path === "string" ? toolIdOfPath(s.path) : "";
    const toolId = raw ? canonicalToolId(raw) : "";
    if (!toolId || !toolById(toolId)) continue; // tool may have vanished
    const path = `/t/${toolId}`;
    if (tabs.value.some((x) => x.path === path) || restored.some((x) => x.path === path)) continue;
    restored.push({
      path,
      toolId,
      icon: toolById(toolId)?.icon ?? "Box",
      pinned: !!s.pinned,
    });
  }
  if (!restored.length) return;
  tabs.value = [
    ...tabs.value,
    ...restored.filter((x) => x.pinned),
    ...restored.filter((x) => !x.pinned),
  ];
}

export function persistTabs() {
  const raw = JSON.stringify(
    tabs.value.map((x) => ({ path: x.path, pinned: x.pinned })),
  );
  try {
    if (inWails()) void StoreService.SetSetting(TABS_KEY, raw);
    else localStorage.setItem(TABS_KEY, raw);
  } catch {
    /* persistence is best-effort */
  }
}
