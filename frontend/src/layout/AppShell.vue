<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import RailNav from "./RailNav.vue";
import CommandBar from "./CommandBar.vue";
import CommandPalette from "./CommandPalette.vue";
import SettingsDialog from "./SettingsDialog.vue";
import TabStrip from "./TabStrip.vue";
import JobDock from "./JobDock.vue";
import DropVeil from "./DropVeil.vue";
import { installDropBridge } from "../lib/drop";
import { installProgressBridge, useJobs } from "../stores/jobs";
import { activateAt, closeActive, cycleTab, persistTabs, restoreTabs, syncFromRoute, useTabs } from "../stores/tabs";
import { toggleInspector } from "../stores/inspector";
import { toggleSidebar } from "../stores/sidebar";
import { openSettings, settingsOpen } from "../stores/settings";
import { toast } from "../stores/toast";
import { t } from "../lib/i18n";
import { inWails } from "../lib/backend";
import { autoCheckForUpdates, releaseInfo, updateState } from "../stores/update";
import { CATEGORIES } from "../lib/tools";
import {
  DEFAULT_COMBOS,
  SHORTCUT_ACTIONS,
  loadShortcuts,
  matches,
  type ShortcutAction,
} from "../lib/shortcuts";

const router = useRouter();
const paletteOpen = ref(false);
const { dockOpen } = useJobs();
const { tabs } = useTabs();

// Customisable bindings — defaults until the stored map loads, and reloaded
// whenever the settings dialog records a change.
const bindings = ref<Record<ShortcutAction, string>>({ ...DEFAULT_COMBOS });

function refreshBindings() {
  void loadShortcuts().then((b) => (bindings.value = b));
}
refreshBindings();

// The router is the single source of truth for which tool is open; the tab
// store just mirrors it, so deep links and palette jumps both create tabs.
router.afterEach((to) => syncFromRoute(to.path));

function runAction(a: ShortcutAction) {
  switch (a) {
    case "palette":
      paletteOpen.value = !paletteOpen.value;
      break;
    case "closeTab":
      closeActive(router);
      break;
    case "toggleDock":
      dockOpen.value = !dockOpen.value;
      break;
    case "toggleInspector":
      toggleInspector();
      break;
    case "toggleSidebar":
      toggleSidebar();
      break;
    case "openSettings":
      openSettings();
      break;
    case "cycleNext":
      cycleTab(1, router);
      break;
    case "cyclePrev":
      cycleTab(-1, router);
      break;
  }
}

function onKey(e: KeyboardEvent) {
  const meta = e.metaKey || e.ctrlKey;
  const inField =
    e.target instanceof HTMLElement &&
    (e.target.tagName === "INPUT" ||
      e.target.tagName === "TEXTAREA" ||
      e.target.isContentEditable);

  // ⌘T mirrors the palette shortcut — muscle memory from browsers. Kept as a
  // fixed alias so the palette is never locked out by a bad rebind.
  if (meta && e.key.toLowerCase() === "t") {
    e.preventDefault();
    paletteOpen.value = true;
    return;
  }
  // ⌘1…⌘9 jumps to the Nth tab; bare digits still switch categories below.
  if (meta && !e.altKey && /^[1-9]$/.test(e.key)) {
    e.preventDefault();
    activateAt(Number(e.key) - 1, router);
    return;
  }
  if (meta || e.altKey) {
    for (const a of SHORTCUT_ACTIONS) {
      if (matches(e, bindings.value[a])) {
        e.preventDefault();
        runAction(a);
        return;
      }
    }
  }
  // Bare digits switch category rails, but never while typing.
  if (!meta && !inField && /^[1-9]$/.test(e.key)) {
    const cat = CATEGORIES[Number(e.key) - 1];
    if (cat) router.push(`/c/${cat.id}`);
  }
}

// The session's tabs are written back debounced, so a burst of
// open/close doesn't hammer the settings table.
let persistTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  tabs,
  () => {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistTabs, 400);
  },
  { deep: true },
);

onMounted(() => {
  void restoreTabs();
  installDropBridge();
  installProgressBridge();
  syncFromRoute(router.currentRoute.value.path);
  window.addEventListener("keydown", onKey);
  // Views below the router (the landing search field) can ask for the
  // palette without prop-drilling through every route.
  window.addEventListener("hitool:open-palette", openPalette);
  // The settings dialog announces shortcut edits.
  window.addEventListener("hitool:shortcuts-changed", refreshBindings);
  silentCheckUpdate();
});

// Quiet launch-time update probe: never blocks startup, never errors out, and
// does nothing at all when automatic updates are switched off. When a newer
// release is found the download starts in the background right away, so by the
// time the user opens About it is usually staged and one click from a restart.
async function silentCheckUpdate() {
  if (!inWails()) return;
  await new Promise((r) => setTimeout(r, 1500));
  await autoCheckForUpdates();
}

// Surface the completed background download as a toast so the user knows a
// restart is all that's left — they may never open the About panel. With the
// panel already open there is nothing to surface: it shows the same state in
// more detail, and a toast on top of it just says everything twice.
watch(updateState, (s) => {
  if (settingsOpen.value) return;
  if (s === "ready" && releaseInfo.value) {
    toast(t("update.downloadedReady", { v: releaseInfo.value.latest }), "ok", 6000);
  } else if (s === "available" && releaseInfo.value) {
    // Found but not yet downloaded (autoInstall can be racing); still nudge.
    toast(t("update.autoAvailable", { v: releaseInfo.value.latest }), "info", 5000);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("hitool:open-palette", openPalette);
  window.removeEventListener("hitool:shortcuts-changed", refreshBindings);
});

function openPalette() {
  paletteOpen.value = true;
}
</script>

<template>
  <div class="shell">
    <RailNav />
    <div class="col">
      <CommandBar @open-palette="paletteOpen = true" />
      <TabStrip />
      <!-- KeepAlive is what makes tabs real: leaving a tool no longer
           destroys its state. Bounded so a long session can't grow
           without limit. No transition — tool components resolve
           asynchronously and a fade strands them at opacity 0. -->
      <div class="stage">
        <router-view v-slot="{ Component }">
          <KeepAlive :max="14">
            <component :is="Component" />
          </KeepAlive>
        </router-view>
      </div>
      <JobDock />
    </div>
    <CommandPalette v-model:open="paletteOpen" />
    <SettingsDialog />
    <DropVeil />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  height: 100%;
  background: var(--bg);
}

.col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--s-1);
}
</style>
