<script setup lang="ts">
/**
 * Settings as a modal: the source list down the left switches between the
 * sections, and opening it never disturbs the tab stack or the current route.
 * The sections load independently so one failing probe can't blank the rest.
 *
 * Each section is a list of rows — name and explanation on the left, the one
 * control that changes it on the right — rather than a wrapped grid of
 * labelled widgets, so a section can grow without the eye having to work out
 * which caption belongs to which control.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { t, lang, setLang } from "../lib/i18n";
import { theme, setTheme, nightHour, setNightHour, type Theme } from "../lib/theme";
import {
  DEFAULT_COMBOS,
  SHORTCUT_ACTIONS,
  comboFromEvent,
  comboText,
  loadShortcuts,
  saveShortcuts,
  type ShortcutAction,
} from "../lib/shortcuts";
import { inWails, openFolder } from "../lib/backend";
import { resetOnboarding } from "../lib/onboarding";
import * as StoreService from "@bindings/hitool/services/storeservice";
import * as SystemService from "@bindings/hitool/services/systemservice";
import type { HistoryItem } from "@bindings/hitool/services/models";
import { settingsOpen, settingsTab, closeSettings, type SettingsTab } from "../stores/settings";
import { toast } from "../stores/toast";
import { errText } from "../lib/err";
import Icon from "../components/Icon.vue";
import Switch from "../components/Switch.vue";
import SettingRow from "../components/SettingRow.vue";
import AiSettings from "./AiSettings.vue";

// Same repo the updater polls (main.go, github.Config.Repository).
const REPO_URL = "https://github.com/sayhia/hitool";

// 版本号来自 Go 侧编译期注入（services.Version），本地 dev 构建显示 "dev"。
// 获取失败时退回占位值，不让整个设置面板受网络/绑定影响。
const appVersion = ref("dev");
/** "dev" as-is, otherwise prefixed with v: v0.7.1 */
const displayVersion = computed(() =>
  appVersion.value === "dev" ? "dev" : `v${appVersion.value}`,
);
const loadVersion = async () => {
  try {
    appVersion.value = (await SystemService.GetVersion()) || "dev";
  } catch {
    appVersion.value = "dev";
  }
};
void loadVersion();

// ---- update (delegates to the global store) ------------------------------
// The store owns the state machine + background pre-download started at boot,
// so About usually just reflects an already-staged update.
import {
  updateState,
  releaseInfo,
  updateProgress,
  updateError,
  autoUpdate,
  lastCheckedAt,
  checkForUpdates,
  setAutoUpdate,
  startInstall,
  restartApp,
  skipVersion,
  dismissUpdate,
} from "../stores/update";

const checking = computed(() => updateState.value === "checking");
const busy = computed(() => checking.value || updateState.value === "downloading");

async function doCheckUpdate() {
  await checkForUpdates(false);
}

/**
 * Turning the switch back on checks straight away. Deferring to the next
 * launch would leave the user staring at a panel that says nothing happened,
 * with no way to tell the setting from a broken one.
 */
async function onAutoUpdate(on: boolean) {
  await setAutoUpdate(on);
  if (on && updateState.value === "idle") void checkForUpdates(true);
}

/** "Up to date" is worthless undated; say when we last actually asked. */
const lastCheckedText = computed(() => {
  const at = lastCheckedAt.value;
  if (!at) return t("update.neverChecked");
  const when = at.toLocaleTimeString(lang.value === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return t("update.lastChecked", { when });
});

const updateErr = computed(() =>
  updateError.value
    ? updateError.value.startsWith("update.")
      ? t(updateError.value)
      : updateError.value
    : "",
);

async function openRelease(url: string) {
  try {
    await SystemService.OpenURL(url);
  } catch (e) {
    toast(errText(e), "fail");
  }
}

/** Replay the first-run tour: clear the flag, then let the app boot it again. */
async function replayOnboarding() {
  await resetOnboarding();
  closeSettings();
  window.location.reload();
}

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: "general", label: "settings.general", icon: "SlidersHorizontal" },
  { id: "ai", label: "settings.tabAi", icon: "Sparkles" },
  { id: "data", label: "settings.data", icon: "Database" },
  { id: "about", label: "settings.about", icon: "Info" },
];

const history = ref<HistoryItem[]>([]);
/** Filters the usage log on the data tab. */
const historyQuery = ref("");

const THEMES: { id: Theme; label: string }[] = [
  { id: "light", label: "settings.themeLight" },
  { id: "dark", label: "settings.themeDark" },
  { id: "auto", label: "settings.themeAuto" },
  { id: "schedule", label: "settings.themeSchedule" },
];

/** Sensible hours for the dark flip — anything earlier reads as afternoon. */
const NIGHT_HOURS = [17, 18, 19, 20, 21, 22, 23];

// ---- keyboard shortcuts ---------------------------------------------------
const bindings = ref<Record<ShortcutAction, string>>({ ...DEFAULT_COMBOS });
/** Non-empty while waiting for the user to press a new combo. */
const recording = ref<ShortcutAction | "">("");

void loadShortcuts().then((b) => (bindings.value = b));

function startRecord(a: ShortcutAction) {
  recording.value = recording.value === a ? "" : a;
}

function onRecordKey(e: KeyboardEvent) {
  if (!recording.value) return;
  if (e.key === "Escape") {
    e.preventDefault();
    // Escape cancels the recording and nothing else. Letting it reach the
    // dialog's own handler would close Settings outright, which is not what
    // "cancel this one combo" should ever mean.
    e.stopPropagation();
    recording.value = "";
    return;
  }
  const combo = comboFromEvent(e);
  if (!combo) return;
  e.preventDefault();
  e.stopPropagation();
  const action = recording.value;
  const map = { ...bindings.value };
  // If the combo is taken, swap: the other action inherits this one's old
  // combo instead of silently losing its shortcut.
  for (const other of SHORTCUT_ACTIONS) {
    if (other !== action && map[other] === combo) map[other] = map[action];
  }
  map[action] = combo;
  bindings.value = map;
  recording.value = "";
  void saveShortcuts(map);
  window.dispatchEvent(new Event("hitool:shortcuts-changed"));
}

watch(recording, (v) => {
  if (v) window.addEventListener("keydown", onRecordKey, true);
  else window.removeEventListener("keydown", onRecordKey, true);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onRecordKey, true);
  window.removeEventListener("keydown", onKey);
});

function resetShortcuts() {
  bindings.value = { ...DEFAULT_COMBOS };
  recording.value = "";
  void saveShortcuts(bindings.value);
  window.dispatchEvent(new Event("hitool:shortcuts-changed"));
}

/**
 * The sections load independently. Chained awaits inside one try meant a
 * failing probe could leave the AI panel blank with no explanation — and a
 * blank API key field reads as "not saved", which is an invitation to retype a
 * key that was there all along.
 */
onMounted(async () => {
  if (!inWails()) return;
  const failed: string[] = [];
  const load = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      failed.push(what);
      console.warn(`settings load ${what}:`, e);
    }
  };

  await Promise.all([
    load("history", async () => {
      history.value = (await StoreService.GetHistory(60)) ?? [];
    }),
  ]);

  if (failed.length) toast(t("settings.loadFailed", { what: failed.join(", ") }), "fail");
});

// ---- focus & keyboard -----------------------------------------------------
const panel = ref<HTMLElement | null>(null);
const nav = ref<HTMLElement | null>(null);
const body = ref<HTMLElement | null>(null);
/** Whatever had focus when the dialog opened, so closing can hand it back. */
let returnFocus: HTMLElement | null = null;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
  ' textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function focusables(): HTMLElement[] {
  if (!panel.value) return [];
  // offsetParent is null for anything display:none — the inactive sections are
  // v-if'd away, but a collapsed row inside one that is shown would otherwise
  // become an invisible stop on the Tab path.
  return [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null,
  );
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    closeSettings();
    return;
  }
  if (e.key !== "Tab") return;
  // A modal that lets Tab walk into the page behind it is only modal to the
  // mouse: wrap at both ends, and pull focus back in if it has already left.
  const items = focusables();
  if (!items.length) return;
  const active = document.activeElement as HTMLElement | null;
  const inside = !!active && !!panel.value?.contains(active);
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey ? !inside || active === first : !inside || active === last) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
}

function focusSelectedTab() {
  nav.value?.querySelector<HTMLElement>(".set-tab.on")?.focus();
}

/**
 * Arrow keys move between sections, the way a source list is expected to
 * behave. The list is a roving tabindex, so Tab treats it as one stop rather
 * than four on the way to the settings themselves.
 */
function onNavKey(e: KeyboardEvent) {
  const i = TABS.findIndex((x) => x.id === settingsTab.value);
  let next = -1;
  if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % TABS.length;
  else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = TABS.length - 1;
  if (next < 0) return;
  e.preventDefault();
  settingsTab.value = TABS[next].id;
  void nextTick(focusSelectedTab);
}

watch(settingsOpen, async (v) => {
  if (v) {
    returnFocus = document.activeElement as HTMLElement | null;
    window.addEventListener("keydown", onKey);
    await nextTick();
    // Land on the section list, not the close button: choosing a section is
    // what a keyboard user came to do, and it puts the arrows within reach.
    focusSelectedTab();
  } else {
    window.removeEventListener("keydown", onKey);
    recording.value = "";
    returnFocus?.focus?.();
    returnFocus = null;
  }
});

// A section switch keeps the previous section's scroll offset otherwise, so a
// short panel can open already scrolled past its own heading.
watch(settingsTab, () => {
  recording.value = "";
  void nextTick(() => body.value?.scrollTo({ top: 0 }));
});

async function clearHistory() {
  await StoreService.ClearHistory();
  history.value = [];
}

const filteredHistory = computed(() => {
  const q = historyQuery.value.trim().toLowerCase();
  if (!q) return history.value;
  return history.value.filter(
    (h) => h.tool.toLowerCase().includes(q) || h.detail.toLowerCase().includes(q),
  );
});

async function openDataDir() {
  await openFolder(await SystemService.DefaultOutputDir(""));
}
</script>

<template>
  <transition name="fade">
    <div v-if="settingsOpen" class="set-veil" @click.self="closeSettings()">
      <div
        ref="panel"
        class="set-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="set-title"
      >
        <header class="set-head">
          <h1 id="set-title">{{ t("settings.title") }}</h1>
          <span class="lab mono">{{ displayVersion }}</span>
          <button class="btn btn-icon close" :title="t('common.close')" @click="closeSettings()">
            <Icon name="X" />
          </button>
        </header>

        <div class="set-main">
          <nav
            ref="nav"
            class="set-side"
            role="tablist"
            aria-orientation="vertical"
            @keydown="onNavKey"
          >
            <button
              v-for="tab in TABS"
              :key="tab.id"
              :id="`set-tab-${tab.id}`"
              class="set-tab"
              :class="{ on: settingsTab === tab.id }"
              role="tab"
              :aria-selected="settingsTab === tab.id"
              :tabindex="settingsTab === tab.id ? 0 : -1"
              @click="settingsTab = tab.id"
            >
              <Icon :name="tab.icon" />
              <span class="truncate">{{ t(tab.label) }}</span>
            </button>
          </nav>

          <div
            ref="body"
            class="set-body"
            :class="{ flush: settingsTab === 'ai', 'scroll-y': settingsTab !== 'ai' }"
            role="tabpanel"
            :aria-labelledby="`set-tab-${settingsTab}`"
          >
            <!-- General: language & appearance -->
            <template v-if="settingsTab === 'general'">
              <section class="block">
                <div class="block-head">
                  <span class="lab">{{ t("settings.general") }}</span>
                </div>
                <div class="rows">
                  <SettingRow :title="t('settings.language')">
                    <div class="seg">
                      <button :class="{ on: lang === 'zh' }" @click="setLang('zh')">中文</button>
                      <button :class="{ on: lang === 'en' }" @click="setLang('en')">English</button>
                    </div>
                  </SettingRow>
                  <SettingRow :title="t('settings.theme')">
                    <div class="theme-ctl">
                      <div class="seg">
                        <button
                          v-for="th in THEMES"
                          :key="th.id"
                          :class="{ on: theme === th.id }"
                          @click="setTheme(th.id)"
                        >
                          {{ t(th.label) }}
                        </button>
                      </div>
                      <div v-if="theme === 'schedule'" class="night-row">
                        <span class="hint">{{ t("settings.darkFrom") }}</span>
                        <select
                          class="input hour"
                          :value="nightHour"
                          @change="
                            setNightHour(Number(($event.target as HTMLSelectElement).value))
                          "
                        >
                          <option v-for="h in NIGHT_HOURS" :key="h" :value="h">{{ h }}:00</option>
                        </select>
                      </div>
                    </div>
                  </SettingRow>
                </div>
              </section>

              <section class="block">
                <div class="block-head">
                  <span class="lab">{{ t("keys.title") }}</span>
                  <button class="btn btn-sm btn-quiet spread" @click="resetShortcuts">
                    {{ t("keys.reset") }}
                  </button>
                </div>
                <div class="rows">
                  <SettingRow v-for="a in SHORTCUT_ACTIONS" :key="a" :title="t(`keys.action.${a}`)">
                    <button
                      class="combo mono"
                      :class="{ rec: recording === a }"
                      :aria-label="t(`keys.action.${a}`)"
                      @click="startRecord(a)"
                    >
                      {{ recording === a ? t("keys.recording") : comboText(bindings[a]) }}
                    </button>
                  </SettingRow>
                </div>
                <p class="block-foot hint">{{ t("keys.hint") }}</p>
              </section>
            </template>

            <!-- Kept alive: a plain v-if destroys the panel on every tab switch,
                 so coming back re-mounts it and re-runs the PATH scan — the panel
                 blinks through its empty state before the agents reappear. -->
            <KeepAlive>
              <AiSettings v-if="settingsTab === 'ai'" />
            </KeepAlive>

            <!-- Data: history & data directory -->
            <section v-if="settingsTab === 'data'" class="block">
              <div class="block-head">
                <span class="lab">{{ t("settings.history") }}</span>
                <span class="lab count">{{ filteredHistory.length }}/{{ history.length }}</span>
              </div>
              <div class="block-body">
                <div class="actions">
                  <div class="search-wrap">
                    <Icon name="Search" class="search-icon" />
                    <input
                      v-model="historyQuery"
                      class="input history-search"
                      :placeholder="t('settings.historySearch')"
                      spellcheck="false"
                    />
                    <button
                      v-if="historyQuery"
                      class="clear-search"
                      :title="t('settings.clearSearch')"
                      :aria-label="t('settings.clearSearch')"
                      @click="historyQuery = ''"
                    >
                      <Icon name="X" />
                    </button>
                  </div>
                  <button class="btn btn-sm" @click="openDataDir">
                    <Icon name="FolderOpen" /> {{ t("settings.openData") }}
                  </button>
                  <button
                    class="btn btn-sm btn-danger"
                    :disabled="!history.length"
                    @click="clearHistory"
                  >
                    <Icon name="Eraser" /> {{ t("settings.clearHistory") }}
                  </button>
                </div>

                <!-- An empty log and a filter that matched nothing are different
                     problems: one is "nothing has run yet", the other is "your
                     search is wrong", and only one of them has a fix. -->
                <p v-if="!history.length" class="hint">{{ t("settings.historyEmpty") }}</p>
                <p v-else-if="!filteredHistory.length" class="hint">
                  {{ t("settings.historyNoMatch") }}
                </p>
                <div v-else class="log scroll-y">
                  <div v-for="h in filteredHistory" :key="h.id" class="logrow">
                    <span class="tag mono">{{ h.tool }}</span>
                    <span class="truncate detail">{{ h.detail }}</span>
                    <span class="lab time mono">{{ h.createdAt }}</span>
                  </div>
                </div>
              </div>
            </section>

            <!-- About -->
            <template v-if="settingsTab === 'about'">
              <section class="block">
                <div class="block-head">
                  <span class="lab">{{ t("settings.about") }}</span>
                </div>
                <div class="block-body about-body">
                  <div class="about-hero">
                    <img
                      class="about-logo"
                      src="/hitool.png"
                      alt="HiTool"
                      width="60"
                      height="60"
                    />
                    <div class="about-id">
                      <h2 class="about-name">
                        HiTool
                        <span class="about-ver mono">{{ displayVersion }}</span>
                      </h2>
                      <p class="hint about-tag">{{ t("settings.aboutTag") }}</p>
                    </div>
                  </div>

                  <p class="hint about-local">{{ t("settings.aboutLocal") }}</p>

                  <div class="about-row">
                    <button class="btn btn-sm" @click="openRelease(REPO_URL)">
                      <Icon name="Github" />
                      {{ t("settings.repo") }}
                    </button>
                    <button class="btn btn-sm" @click="openRelease(`${REPO_URL}/issues`)">
                      <Icon name="MessageSquare" />
                      {{ t("settings.feedback") }}
                    </button>
                    <button class="btn btn-sm" @click="replayOnboarding()">
                      <Icon name="PlayCircle" />
                      {{ t("onb.replay") }}
                    </button>
                  </div>
                </div>
              </section>

              <section class="block">
                <div class="block-head">
                  <span class="lab">{{ t("settings.updates") }}</span>
                </div>
                <div class="rows">
                  <SettingRow
                    :title="t('update.auto')"
                    :desc="autoUpdate ? t('update.autoDesc') : t('update.autoOffDesc')"
                  >
                    <Switch
                      :model-value="autoUpdate"
                      :label="t('update.auto')"
                      @update:model-value="onAutoUpdate"
                    />
                  </SettingRow>
                </div>
                <div class="block-body upd-body">
                  <div class="about-row">
                    <button class="btn btn-sm" :disabled="busy" @click="doCheckUpdate()">
                      <Icon name="RefreshCw" :class="{ spin: checking }" />
                      {{ checking ? t("update.checking") : t("update.check") }}
                    </button>
                    <span class="hint checked">{{ lastCheckedText }}</span>
                  </div>

                  <p v-if="updateErr" class="hint update-err">{{ updateErr }}</p>
                  <div v-else-if="updateState === 'ready'" class="update-res">
                    <p class="hint">
                      <strong>{{ t("update.ready") }}</strong>
                    </p>
                    <div class="update-actions">
                      <button class="btn btn-sm btn-primary" @click="restartApp()">
                        <Icon name="RotateCw" />
                        {{ t("update.restartNow") }}
                      </button>
                      <button class="btn link" @click="dismissUpdate()">
                        {{ t("update.later") }}
                      </button>
                    </div>
                  </div>
                  <div v-else-if="updateState === 'downloading'" class="update-res">
                    <p class="hint">
                      {{ t("update.installing") }}
                      <span class="mono pct">{{ Math.round(updateProgress * 100) }}%</span>
                    </p>
                    <progress class="upd-bar" :value="Math.round(updateProgress * 100)" max="100" />
                  </div>
                  <div v-else-if="updateState === 'available' && releaseInfo" class="update-res">
                    <p class="hint">
                      <strong>{{ t("update.available", { v: releaseInfo.latest }) }}</strong>
                    </p>
                    <details v-if="releaseInfo.notes" class="upd-notes">
                      <summary>{{ t("update.notesLabel") }}</summary>
                      <pre class="upd-notes-body">{{ releaseInfo.notes }}</pre>
                    </details>
                    <div class="update-actions">
                      <button class="btn btn-sm btn-primary" @click="startInstall()">
                        <Icon name="Download" />
                        {{ t("update.install") }}
                      </button>
                      <button class="btn link" @click="skipVersion(releaseInfo.latest)">
                        {{ t("update.skipVersion") }}
                      </button>
                      <button class="btn link" @click="openRelease(releaseInfo.url)">
                        {{ t("update.open") }}
                      </button>
                    </div>
                  </div>
                  <p v-else-if="updateState === 'checking'" class="hint">
                    {{ t("update.checking") }}
                  </p>
                  <p v-else class="hint">{{ t("update.latest") }}</p>
                </div>
              </section>
            </template>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.set-veil {
  position: fixed;
  inset: 0;
  z-index: 58;
  background: color-mix(in srgb, var(--ink) 18%, transparent);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

/* One size for every tab. The panel used to grow for the AI tab, which made the
   dialog jump and reflow under the pointer on a plain tab switch — the AI grids
   are auto-fill and lay out fine at this width, so the extra room bought a
   resize animation and nothing else. */
.set-panel {
  width: min(820px, calc(100vw - 48px));
  height: min(620px, calc(100vh - 72px));
  display: flex;
  flex-direction: column;
  background: var(--s-2);
  border: 1px solid var(--line-2);
  border-radius: var(--r-xl);
  box-shadow: var(--e-3);
  overflow: hidden;
}

.set-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 12px 10px 16px;
  border-bottom: 1px solid var(--line-2);
}

.set-head h1 {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.set-head .close {
  margin-left: auto;
}

.set-main {
  flex: 1;
  min-height: 0;
  display: flex;
}

/* macOS System Settings-style source list down the left edge. */
.set-side {
  flex-shrink: 0;
  width: 172px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px;
  border-right: 1px solid var(--line-2);
  background: color-mix(in srgb, var(--s-2) 72%, var(--s-1));
}

.set-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  font-family: var(--f-ui);
  font-size: 12.5px;
  font-weight: 550;
  text-align: left;
  cursor: pointer;
  transition: background 0.14s var(--ease), color 0.14s var(--ease);
}

.set-tab :deep(svg) {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.85;
}

.set-tab:hover {
  background: var(--hover-strong);
}

.set-tab.on {
  background: var(--acc-wash);
  color: var(--acc);
}

.set-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.set-body.flush {
  padding: 0;
  overflow: hidden;
  gap: 0;
}

/* inset grouped: white cards floating on the grey panel, hairline seams */
.block {
  /* The body is a flex column, so a block would otherwise shrink to share the
     visible height with its siblings — and `overflow: hidden` turns that into
     a card cut off mid-row rather than a scroll. Blocks keep their height; the
     body scrolls. */
  flex-shrink: 0;
  border: 1px solid var(--line-2);
  border-radius: var(--r-lg);
  background: var(--s-1);
  box-shadow: var(--e-1);
  overflow: hidden;
}

.block-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line-2);
}

.state,
.count,
.spread {
  margin-left: auto;
  text-transform: none;
}

.block-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}

/* A row list sets its own padding, so the block gives it none. */
.rows {
  display: flex;
  flex-direction: column;
}

/* Anything after a row list is a second register — separate it the same way
   the rows separate from each other. */
.rows + .block-body {
  border-top: 1px solid var(--line-2);
}

.block-foot {
  margin: 0;
  padding: 10px 14px 12px;
  border-top: 1px solid var(--line-2);
  line-height: 1.55;
}

.theme-ctl {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}

/* The field owns the icon and the clear button so they travel with it when
   the row wraps. */
.search-wrap {
  position: relative;
  flex: 1;
  min-width: 160px;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 9px;
  color: var(--ink-3);
  pointer-events: none;
}

.search-wrap :deep(svg) {
  width: 13px;
  height: 13px;
}

.history-search {
  width: 100%;
  padding-left: 27px;
  padding-right: 26px;
}

.clear-search {
  position: absolute;
  right: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
}

.clear-search:hover {
  background: var(--s-3);
  color: var(--ink);
}

/* Usage log reads as a printout: fixed columns, hairline separators. */
.log {
  max-height: 240px;
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  background: var(--s-2);
}

.logrow {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 5px 9px;
  border-bottom: 1px solid var(--line-2);
  font-size: 11.5px;
}

.logrow:last-child {
  border-bottom: 0;
}

.tag {
  width: 108px;
  flex-shrink: 0;
  font-size: 10px;
  color: var(--ink-3);
}

.detail {
  flex: 1;
  min-width: 0;
}

.time {
  flex-shrink: 0;
  text-transform: none;
  font-size: 10px;
}

.about-body {
  gap: 16px;
}

.about-hero {
  display: flex;
  align-items: center;
  gap: 14px;
}

.about-logo {
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  border-radius: var(--r-lg);
  display: block;
}

.about-id {
  min-width: 0;
}

.about-name {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.about-ver {
  font-size: 11px;
  font-weight: 500;
  color: var(--ink-3);
  background: var(--acc-wash);
  border-radius: var(--r-pill);
  padding: 2px 8px;
}

.about-tag {
  margin-top: 3px;
  line-height: 1.6;
  max-width: 52ch;
}

.about-local {
  line-height: 1.7;
  max-width: 58ch;
  padding-left: 10px;
  border-left: 2px solid var(--line-2);
}

.about-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.about-row .spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.checked {
  font-variant-numeric: tabular-nums;
}

.upd-body {
  gap: 10px;
}

.update-res {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.update-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pct {
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}

.upd-notes {
  width: 100%;
  margin: 2px 0;
}
.upd-notes > summary {
  font-size: 12px;
  color: var(--ink-3);
  cursor: pointer;
  user-select: none;
}
.upd-notes-body {
  margin: 6px 0 0;
  padding: 8px 10px;
  max-height: 180px;
  overflow: auto;
  border: 0.5px solid var(--line-2);
  border-radius: var(--r-sm);
  background: var(--s-2);
  font-family: var(--f-mono);
  font-size: 11.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--ink-2);
}

.upd-bar {
  width: 240px;
  height: 6px;
  border: none;
  border-radius: 3px;
  background: var(--s-3);
  overflow: hidden;
}
.upd-bar::-webkit-progress-bar {
  background: var(--s-3);
  border-radius: 3px;
}
.upd-bar::-webkit-progress-value {
  background: var(--acc);
  border-radius: 3px;
  transition: width 0.2s var(--ease);
}

.update-err {
  color: var(--fail);
}

.btn.link {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  color: var(--acc);
  padding: 0 6px;
}

/* Mirrors the palette's rise-and-fade so the two overlays feel related. */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s var(--ease);
}

.fade-enter-active .set-panel,
.fade-leave-active .set-panel {
  transition: transform 0.18s var(--ease-out), opacity 0.18s var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-from .set-panel,
.fade-leave-to .set-panel {
  transform: translateY(6px) scale(0.985);
}

.night-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.night-row .hour {
  width: 84px;
  height: 30px;
}

.combo {
  min-width: 116px;
  padding: 5px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--s-2);
  color: var(--ink);
  font-size: var(--t-xs);
  cursor: pointer;
  transition: border-color 0.14s var(--ease), color 0.14s var(--ease);
}

.combo:hover {
  border-color: var(--acc-line);
  color: var(--acc);
}

.combo.rec {
  border-color: var(--acc);
  background: var(--acc-wash);
  color: var(--acc);
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.65;
  }
}
</style>
