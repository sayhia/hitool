<script setup lang="ts">
/**
 * Settings as a modal: the tab row up top switches between the sections,
 * and opening it never disturbs the tab stack or the current route. The
 * sections load independently so one failing probe can't blank the rest.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
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
import AiSettings from "./AiSettings.vue";

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
  checkForUpdates,
  startInstall,
  restartApp,
  skipVersion,
  dismissUpdate,
} from "../stores/update";

const checking = computed(() => updateState.value === "checking");

async function doCheckUpdate() {
  await checkForUpdates(false);
}

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

// ESC dismisses the dialog while it is on screen.
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") closeSettings();
}

watch(settingsOpen, (v) => {
  if (v) window.addEventListener("keydown", onKey);
  else window.removeEventListener("keydown", onKey);
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
      <div class="set-panel" :class="{ ai: settingsTab === 'ai' }" role="dialog" aria-modal="true">
        <header class="set-head">
          <h1>{{ t("settings.title") }}</h1>
          <span class="lab mono">{{ displayVersion }}</span>
          <button class="btn btn-icon close" :title="t('common.close')" @click="closeSettings()">
            <Icon name="X" />
          </button>
        </header>

        <div class="set-main">
        <nav class="set-side">
          <button
            v-for="tab in TABS"
            :key="tab.id"
            class="set-tab"
            :class="{ on: settingsTab === tab.id }"
            @click="settingsTab = tab.id"
          >
            <Icon :name="tab.icon" />
            <span class="truncate">{{ t(tab.label) }}</span>
          </button>
        </nav>

        <div class="set-body" :class="{ flush: settingsTab === 'ai', 'scroll-y': settingsTab !== 'ai' }">
          <!-- General: language & appearance -->
          <section v-if="settingsTab === 'general'" class="block">
            <div class="block-head"><span class="lab">{{ t("settings.general") }}</span></div>
            <div class="block-body">
              <div class="pair">
                <div class="field">
                  <span class="lab">{{ t("settings.language") }}</span>
                  <div class="seg">
                    <button :class="{ on: lang === 'zh' }" @click="setLang('zh')">中文</button>
                    <button :class="{ on: lang === 'en' }" @click="setLang('en')">English</button>
                  </div>
                </div>
                <div class="field">
                  <span class="lab">{{ t("settings.theme") }}</span>
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
                      @change="setNightHour(Number(($event.target as HTMLSelectElement).value))"
                    >
                      <option v-for="h in NIGHT_HOURS" :key="h" :value="h">{{ h }}:00</option>
                    </select>
                  </div>
                </div>
                <div class="field">
                  <div class="keys-head">
                    <span class="lab">{{ t("keys.title") }}</span>
                    <button class="btn btn-sm btn-quiet" @click="resetShortcuts">
                      {{ t("keys.reset") }}
                    </button>
                  </div>
                  <div v-for="a in SHORTCUT_ACTIONS" :key="a" class="keyrow">
                    <span class="keyname">{{ t(`keys.action.${a}`) }}</span>
                    <button
                      class="combo mono"
                      :class="{ rec: recording === a }"
                      @click="startRecord(a)"
                    >
                      {{ recording === a ? t("keys.recording") : comboText(bindings[a]) }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <AiSettings v-if="settingsTab === 'ai'" />

          <!-- Data: history & data directory -->
          <section v-if="settingsTab === 'data'" class="block">
            <div class="block-head">
              <span class="lab">{{ t("settings.history") }}</span>
              <span class="lab count">{{ filteredHistory.length }}/{{ history.length }}</span>
            </div>
            <div class="block-body">
              <div class="actions">
                <input
                  v-model="historyQuery"
                  class="input history-search"
                  :placeholder="t('settings.historySearch')"
                  spellcheck="false"
                />
                <button class="btn btn-sm" @click="openDataDir">
                  <Icon name="FolderOpen" /> {{ t("settings.openData") }}
                </button>
                <button class="btn btn-sm btn-danger" :disabled="!history.length" @click="clearHistory">
                  <Icon name="Eraser" /> {{ t("settings.clearHistory") }}
                </button>
              </div>

              <p v-if="!filteredHistory.length" class="hint">{{ t("settings.historyEmpty") }}</p>
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
          <section v-if="settingsTab === 'about'" class="block">
            <div class="block-head"><span class="lab">{{ t("settings.about") }}</span></div>
            <div class="block-body">
              <div class="about-brand">
                <img class="about-logo" src="/hitool.png" alt="HiTool" width="56" height="56" />
                <div>
                  <p class="hint about">{{ t("settings.aboutText") }}</p>
                  <p class="lab mono stack-line">Go · Wails3 · Vite · Vue 3 · SQLite · {{ displayVersion }}</p>
                </div>
              </div>

              <div class="about-row">
                <button class="btn" :disabled="checking" @click="doCheckUpdate()">
                  <Icon name="RefreshCw" :class="{ spin: checking }" />
                  {{ checking ? t("update.checking") : t("update.check") }}
                </button>
                <button class="btn" @click="replayOnboarding()">
                  <Icon name="PlayCircle" />
                  {{ t("onb.replay") }}
                </button>
              </div>

              <p v-if="updateErr" class="hint update-err">{{ updateErr }}</p>
              <div v-else-if="updateState === 'ready'" class="update-res">
                <p class="hint"><strong>{{ t("update.ready") }}</strong></p>
                <div class="update-actions">
                  <button class="btn btn-sm" @click="restartApp()">
                    <Icon name="RotateCw" />
                    {{ t("update.restartNow") }}
                  </button>
                  <button class="btn link" @click="dismissUpdate()">{{ t("update.later") }}</button>
                </div>
              </div>
              <div v-else-if="updateState === 'downloading'" class="update-res">
                <p class="hint">{{ t("update.installing") }}</p>
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
                  <button class="btn btn-sm" @click="startInstall()">
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
              <p v-else-if="updateState === 'checking'" class="hint">{{ t("update.checking") }}</p>
              <p v-else-if="updateState === 'idle'" class="hint">{{ t("update.latest") }}</p>
            </div>
          </section>
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
  transition: width 0.18s var(--ease-out), height 0.18s var(--ease-out);
}

.set-panel.ai {
  width: min(920px, calc(100vw - 40px));
  height: min(680px, calc(100vh - 56px));
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
.count {
  margin-left: auto;
  text-transform: none;
}

.block-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.pair {
  display: flex;
  gap: 11px;
  flex-wrap: wrap;
}

/* Size to content so multi-option segments aren't clipped, with a floor. */
.pair > .field {
  flex: 0 0 auto;
  min-width: 160px;
}

.pair > .field.grow {
  flex: 1;
}

.keyrow {
  display: flex;
  gap: 6px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}

.history-search {
  flex: 1;
  min-width: 140px;
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

.about-brand {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.about-logo {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: var(--r-lg);
  display: block;
}

.about {
  line-height: 1.7;
  max-width: 62ch;
}

.about-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.about-row .spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.update-res {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-top: 8px;
}

.update-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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
  margin-top: 8px;
  color: var(--fail);
}

.btn.link {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  color: var(--acc);
  padding: 0 6px;
}

.stack-line {
  text-transform: none;
  letter-spacing: 0.06em;
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
  margin-top: 8px;
}

.night-row .hour {
  width: 84px;
  height: 30px;
}

.keys-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.keys-head .btn {
  margin-left: auto;
}

.keyrow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
}

.keyname {
  flex: 1;
  font-size: var(--t-sm);
  color: var(--ink-2);
}

.combo {
  min-width: 96px;
  padding: 4px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--s-2);
  color: var(--ink);
  font-size: var(--t-xs);
  cursor: pointer;
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
