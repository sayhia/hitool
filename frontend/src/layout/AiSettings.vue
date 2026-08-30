<script setup lang="ts">
/**
 * AI execution settings, laid out like OpenDesign:
 * sticky 本机 CLI / API 提供商 switch, agent cards with PATH scan,
 * or a BYOK provider chip row + key/model/base-url card.
 */
import { computed, onMounted, ref, watch } from "vue";
import { t } from "../lib/i18n";
import { inWails } from "../lib/backend";
import { settingsOpen, settingsTab } from "../stores/settings";
import { toast } from "../stores/toast";
import { errText } from "../lib/err";
import Icon from "../components/Icon.vue";
import * as AIService from "@bindings/hitool/services/aiservice";
import * as SystemService from "@bindings/hitool/services/systemservice";
import type { AIProvider, AIProfile, AIProfileList, CLIAgent } from "@bindings/hitool/services/models";

type Mode = "cli" | "api";

const AGENT_ICONS: Record<string, string> = {
  claude: "Sparkles",
  codex: "Box",
  cursor: "MousePointer2",
  gemini: "Gem",
  copilot: "Github",
  opencode: "Code2",
  qwen: "Bot",
  grok: "Zap",
  kimi: "Moon",
  qoder: "AppWindow",
  pi: "Circle",
  kiro: "Bird",
  kilo: "Cpu",
  vibe: "Music",
  deepseek: "Waves",
  dsh: "Layers",
  reasonix: "Brain",
  antigravity: "Orbit",
  codebuddy: "Users",
  mimo: "Smartphone",
  atomcode: "Atom",
  hermes: "Send",
  trae: "Feather",
  amp: "Activity",
  devin: "Bot",
  aider: "Wrench",
};

const providers = ref<AIProvider[]>([]);
const profiles = ref<AIProfile[]>([]);
const activeId = ref("");
const draft = ref<AIProfile | null>(null);
const dirty = ref(false);
const showKey = ref(false);
const showAdvanced = ref(false);
const showName = ref(false);
const showCustomCmd = ref(false);
const testing = ref(false);
const saving = ref(false);
const fetching = ref(false);
const modelOptions = ref<string[]>([]);
const cliAgents = ref<CLIAgent[]>([]);
const scanning = ref(false);
/** False until the first load() settles. Without it the "you have no CLI
 *  installed" copy renders during the very first round-trip and is then
 *  replaced by the agent grid — a flash of the wrong answer. */
const loaded = ref(false);
const rescanNotice = ref<"ok" | "fail" | "">("");
const testLine = ref("");
const testOk = ref(false);
const missingOpen = ref(false);

const mode = computed<Mode>(() => (isCli(draft.value) ? "cli" : "api"));

const apiProviders = computed(() => providers.value.filter((p) => p.id !== "cli"));
const cloudProviders = computed(() => apiProviders.value.filter((p) => !p.noKey));
const localHttpProviders = computed(() => apiProviders.value.filter((p) => p.noKey));

const installedAgents = computed(() => cliAgents.value.filter((a) => a.installed));
const missingAgents = computed(() => cliAgents.value.filter((a) => !a.installed));

const selectedAgent = computed(() =>
  cliAgents.value.find((a) => a.installed && agentSelected(a)) ?? null,
);

const isActive = computed(() => !!draft.value?.id && draft.value.id === activeId.value);

const canTest = computed(() => {
  const p = draft.value;
  if (!p) return false;
  if (isCli(p)) return !!(p.command || "").trim();
  if (noKeyProvider(p.platform)) return !!(p.model || defaultModel(p.platform));
  return !!(p.apiKey || "").trim() && !!(p.model || defaultModel(p.platform) || p.baseUrl);
});

const showFetchModels = computed(() => {
  if (!draft.value) return false;
  if (!isCli(draft.value)) return true;
  return (draft.value.command || "").includes("ollama");
});

const KEY_PH: Record<string, string> = {
  deepseek: "sk-…",
  openai: "sk-…",
  qwen: "sk-…",
  moonshot: "sk-…",
  glm: "…",
  doubao: "…",
  custom: "sk-…",
};

const KEY_LINKS: Record<string, string> = {
  deepseek: "https://platform.deepseek.com/api_keys",
  openai: "https://platform.openai.com/api-keys",
  qwen: "https://bailian.console.aliyun.com/",
  moonshot: "https://platform.moonshot.cn/console/api-keys",
  glm: "https://open.bigmodel.cn/usercenter/apikeys",
  doubao: "https://console.volcengine.com/ark",
};

const canTestWhy = computed(() => {
  const p = draft.value;
  if (!p) return t("ai.settings.testNeedCli");
  if (isCli(p) && !(p.command || "").trim()) return t("ai.settings.testNeedCli");
  if (noKeyProvider(p.platform) && !(p.model || defaultModel(p.platform))) {
    return t("ai.settings.testNeedModel");
  }
  if (!isCli(p) && !noKeyProvider(p.platform) && !(p.apiKey || "").trim()) {
    return t("ai.settings.testNeedKey");
  }
  if (!isCli(p) && !(p.model || defaultModel(p.platform))) return t("ai.settings.testNeedModel");
  return t("ai.settings.testTitle");
});

function applyList(list: AIProfileList) {
  profiles.value = list.profiles ?? [];
  activeId.value = list.activeId;
}

function snapshot(p: AIProfile): AIProfile {
  return { ...p, command: p.command ?? "", baseUrl: p.baseUrl ?? "", apiKey: p.apiKey ?? "" };
}

function isCli(p?: { platform?: string } | null) {
  return p?.platform === "cli";
}

function noKeyProvider(id: string) {
  return !!providers.value.find((p) => p.id === id)?.noKey;
}

function platformLabel(id: string) {
  const k = `ai.settings.providers.${id}`;
  const tr = t(k);
  if (tr !== k) return tr;
  return providers.value.find((p) => p.id === id)?.label ?? id;
}

function defaultModel(id: string) {
  return providers.value.find((p) => p.id === id)?.model ?? "";
}

function defaultBase(id: string) {
  return providers.value.find((p) => p.id === id)?.baseUrl ?? "";
}

function providerConfigured(id: string) {
  return profiles.value.some((p) => {
    if (p.platform !== id) return false;
    if (noKeyProvider(id)) return !!(p.model || p.baseUrl || p.id === activeId.value);
    if (id === "custom") return !!(p.baseUrl && (p.apiKey || p.model));
    return !!(p.apiKey || "").trim();
  });
}

function blankApi(platform: string): AIProfile {
  return {
    id: "",
    name: platformLabel(platform),
    platform,
    apiKey: "",
    model: defaultModel(platform),
    baseUrl: "",
    command: "",
    customUrl: "",
  };
}

function blankCli(): AIProfile {
  return {
    id: "",
    name: t("ai.settings.localCli"),
    platform: "cli",
    apiKey: "",
    model: "",
    baseUrl: "",
    command: "",
    customUrl: "",
  };
}

function profileForPlatform(id: string) {
  const match = profiles.value.filter((p) => p.platform === id);
  return match.find((p) => p.id === activeId.value) ?? match[0];
}

function loadDraft(p: AIProfile) {
  draft.value = snapshot(p);
  dirty.value = false;
  showKey.value = false;
  showAdvanced.value = p.platform === "custom" || (!!p.baseUrl && p.platform !== "cli" && !noKeyProvider(p.platform));
  showName.value = !!p.name && p.name !== platformLabel(p.platform) && p.name !== p.platform;
  modelOptions.value = [];
  testLine.value = "";
  syncCustomCmd();
}

async function flushDraft() {
  if (!dirty.value || !draft.value) return true;
  if (draft.value.id) {
    await save(true);
    return !dirty.value;
  }
  const p = draft.value;
  const empty =
    !(p.apiKey || "").trim() &&
    !(p.command || "").trim() &&
    !(p.baseUrl || "").trim() &&
    (!(p.model || "").trim() || p.model === defaultModel(p.platform));
  if (empty) return true;
  return window.confirm(t("ai.settings.discard"));
}

async function setMode(m: Mode) {
  if (mode.value === m) return;
  if (!(await flushDraft())) return;
  testLine.value = "";
  if (m === "cli") {
    const existing = profileForPlatform("cli");
    loadDraft(existing ? snapshot(existing) : blankCli());
    await scanAgents(false);
  } else {
    const existing =
      profiles.value.find((p) => p.platform !== "cli" && p.id === activeId.value) ??
      profiles.value.find((p) => p.platform !== "cli");
    loadDraft(existing ? snapshot(existing) : blankApi("deepseek"));
  }
}

function agentIcon(id: string) {
  return AGENT_ICONS[id] || "Terminal";
}

function agentSelected(ag: CLIAgent) {
  const cmd = (draft.value?.command || "").trim();
  if (!cmd) return false;
  if (cmd === ag.command) return true;
  const first = cmd.split(/\s+/)[0];
  return first === ag.bin || first === ag.path;
}

function versionLabel(ag: CLIAgent) {
  const v = (ag.version || "").trim();
  if (!v) return ag.path || t("ai.settings.cliInstalled");
  return v.replace(new RegExp(`\\s*\\(${ag.label}\\)\\s*$`, "i"), "").trim() || v;
}

function syncCustomCmd() {
  if (!draft.value || !isCli(draft.value)) {
    showCustomCmd.value = false;
    return;
  }
  const cmd = (draft.value.command || "").trim();
  showCustomCmd.value = !!cmd && !cliAgents.value.some((ag) => agentSelected(ag));
}

function markDirty() {
  dirty.value = true;
  testLine.value = "";
}

async function saveOnBlur() {
  if (!dirty.value || !draft.value?.id) return;
  await save(true);
}

async function applyCliAgent(ag: CLIAgent) {
  if (!ag.installed) {
    if (ag.installUrl) void SystemService.OpenURL(ag.installUrl);
    return;
  }
  if (agentSelected(ag)) return;
  const existing = profileForPlatform("cli");
  draft.value = {
    ...(existing ? snapshot(existing) : blankCli()),
    name: ag.label,
    platform: "cli",
    command: ag.command,
    apiKey: "",
    baseUrl: "",
  };
  showCustomCmd.value = false;
  dirty.value = true;
  await save(true);
}

async function setApiProvider(id: string) {
  if (!draft.value || isCli(draft.value)) return;
  if (draft.value.platform === id) return;
  if (!(await flushDraft())) return;
  testLine.value = "";
  const existing = profileForPlatform(id);
  if (existing) {
    loadDraft(existing);
    return;
  }
  draft.value = blankApi(id);
  showAdvanced.value = id === "custom";
  showName.value = false;
  modelOptions.value = [];
  dirty.value = true;
}

async function scanAgents(fromUser = false) {
  if (!inWails()) return;
  scanning.value = true;
  if (fromUser) rescanNotice.value = "";
  try {
    cliAgents.value = (await AIService.DetectCLIAgents()) ?? [];
    if (isCli(draft.value) && !(draft.value?.command || "").trim()) {
      const first = installedAgents.value[0];
      if (first) await applyCliAgent(first);
    }
    syncCustomCmd();
    if (fromUser) rescanNotice.value = "ok";
  } catch (e) {
    if (fromUser) rescanNotice.value = "fail";
    toast(errText(e), "fail");
  } finally {
    scanning.value = false;
  }
}

async function save(silent = false) {
  if (!draft.value) return;
  saving.value = true;
  try {
    const list = await AIService.SaveProfile(draft.value);
    applyList(list);
    const id = draft.value.id || list.profiles?.at(-1)?.id || list.activeId;
    const saved = (list.profiles ?? []).find((x) => x.id === id);
    draft.value = saved ? snapshot(saved) : draft.value;
    dirty.value = false;
    if (saved?.id && saved.id !== activeId.value) {
      applyList(await AIService.SetActiveProfile(saved.id));
    }
    if (!silent) toast(t("ai.settings.saved"), "ok");
  } catch (e) {
    toast(errText(e), "fail");
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!draft.value?.id) {
    draft.value = profiles.value[0] ? snapshot(profiles.value[0]) : blankApi("deepseek");
    dirty.value = false;
    return;
  }
  if (!window.confirm(t("ai.settings.deleteConfirm"))) return;
  applyList(await AIService.DeleteProfile(draft.value.id));
  const next = profiles.value.find((p) => p.id === activeId.value) ?? profiles.value[0];
  draft.value = next ? snapshot(next) : blankApi("deepseek");
  dirty.value = false;
  testLine.value = "";
}

async function test() {
  if (!draft.value || !canTest.value) return;
  testing.value = true;
  testLine.value = "";
  try {
    const res = await AIService.TestProfile(draft.value);
    testOk.value = true;
    testLine.value = t("ai.settings.testOk", { what: res });
  } catch (e) {
    testOk.value = false;
    testLine.value = errText(e);
  } finally {
    testing.value = false;
  }
}

function pickModel(m: string) {
  if (!draft.value) return;
  draft.value.model = m;
  markDirty();
  void saveOnBlur();
}

async function fetchModels() {
  if (!draft.value) return;
  fetching.value = true;
  try {
    const ids = (await AIService.FetchModels(draft.value)) ?? [];
    modelOptions.value = ids;
    if (ids.length && draft.value && !(draft.value.model || "").trim()) {
      draft.value.model = ids[0];
      dirty.value = true;
      await saveOnBlur();
    }
    toast(t("ai.settings.modelsFetched", { n: ids.length }), "ok");
  } catch (e) {
    toast(errText(e), "fail", 4200);
  } finally {
    fetching.value = false;
  }
}

async function load() {
  if (!inWails()) {
    loaded.value = true;
    return;
  }
  if (dirty.value) return;
  try {
    providers.value = (await AIService.Providers()) ?? [];
    applyList(await AIService.GetProfiles());
    cliAgents.value = (await AIService.DetectCLIAgents()) ?? [];
    const cur = profiles.value.find((p) => p.id === activeId.value) ?? profiles.value[0];
    if (cur) loadDraft(cur);
    else draft.value = blankApi("deepseek");
  } catch (e) {
    // A failed *refresh* leaves the panel showing the data it already had, so
    // don't stack a red toast on top of it every time the tab is re-entered.
    if (!loaded.value) toast(errText(e), "fail");
  } finally {
    loaded.value = true;
  }
}

onMounted(load);
watch(
  () => [settingsOpen.value, settingsTab.value] as const,
  ([open, tab]) => {
    if (open && tab === "ai") void load();
  },
);
let noticeTimer = 0;
watch(rescanNotice, (v) => {
  window.clearTimeout(noticeTimer);
  if (!v) return;
  noticeTimer = window.setTimeout(() => {
    rescanNotice.value = "";
  }, 5200);
});
watch(
  installedAgents,
  (list) => {
    if (!list.length) missingOpen.value = true;
  },
  { immediate: true },
);
</script>

<template>
  <div class="exec">
    <div class="sticky">
      <div class="seg dual" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'cli'"
          :class="{ on: mode === 'cli' }"
          @click="setMode('cli')"
        >
          <span class="seg-title">{{ t("ai.settings.localCli") }}</span>
          <span class="seg-meta">{{ t("ai.settings.modeCliMeta", { n: installedAgents.length }) }}</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'api'"
          :class="{ on: mode === 'api' }"
          @click="setMode('api')"
        >
          <span class="seg-title">{{ t("ai.settings.modeApi") }}</span>
          <span class="seg-meta">{{ t("ai.settings.modeApiMeta") }}</span>
        </button>
      </div>
    </div>

    <div v-if="mode === 'cli'" class="pane cli">
      <div class="pane-scroll scroll-y">
      <p class="hint path-hint">{{ t("ai.settings.pathHint") }}</p>
      <div class="group-head">
        <h3>{{ t("ai.settings.agentInstalledGroup", { n: installedAgents.length }) }}</h3>
        <div class="group-actions">
          <span v-if="rescanNotice === 'ok'" class="notice ok">{{ t("ai.settings.rescanSuccess", { n: installedAgents.length }) }}</span>
          <span v-else-if="rescanNotice === 'fail'" class="notice fail">{{ t("ai.settings.rescanFailed") }}</span>
          <button
            type="button"
            class="btn btn-sm btn-quiet"
            :disabled="scanning"
            :title="t('ai.settings.rescanTitle')"
            @click="scanAgents(true)"
          >
            <Icon name="RefreshCw" :class="{ spin: scanning }" />
            {{ scanning ? t("ai.settings.scanning") : t("ai.settings.scanCli") }}
          </button>
        </div>
      </div>

      <div v-if="(scanning || !loaded) && !cliAgents.length" class="skel" aria-hidden="true">
        <span /><span /><span />
      </div>
      <div v-else-if="installedAgents.length" class="agent-grid">
        <button
          v-for="ag in installedAgents"
          :key="ag.id"
          type="button"
          class="agent-card"
          :class="{ on: agentSelected(ag) }"
          @click="applyCliAgent(ag)"
        >
          <span class="agent-ico"><Icon :name="agentIcon(ag.id)" /></span>
          <span class="agent-body">
            <span class="agent-name">{{ ag.label }}</span>
            <span v-if="ag.tagline" class="agent-tagline truncate">{{ ag.tagline }}</span>
            <span class="agent-meta truncate" :title="ag.path">{{ versionLabel(ag) }}</span>
          </span>
          <span v-if="agentSelected(ag)" class="agent-use">{{ t("ai.settings.active") }}</span>
        </button>
      </div>
      <p v-else class="empty-card">{{ t("ai.settings.cliNone") }}</p>

      <details
        v-if="missingAgents.length"
        class="missing-fold"
        :open="missingOpen"
        @toggle="missingOpen = ($event.target as HTMLDetailsElement).open"
      >
        <summary>
          {{ t("ai.settings.agentMissingGroup", { n: missingAgents.length }) }}
          <span class="hint">{{ t("ai.settings.cliInstallHint") }}</span>
        </summary>
        <div class="agent-grid compact">
          <button
            v-for="ag in missingAgents"
            :key="ag.id"
            type="button"
            class="agent-card miss"
            :title="ag.installUrl || t('ai.settings.cliInstallHint')"
            @click="applyCliAgent(ag)"
          >
            <span class="agent-ico"><Icon :name="agentIcon(ag.id)" /></span>
            <span class="agent-body">
              <span class="agent-name">{{ ag.label }}</span>
              <span class="agent-meta">{{ t("ai.settings.cliMissing") }}</span>
            </span>
            <Icon name="ExternalLink" />
          </button>
        </div>
      </details>

      <ol v-if="loaded && !installedAgents.length && !scanning" class="install-steps">
        <li>{{ t("ai.settings.agentInstall.stepOpenLinks") }}</li>
        <li>{{ t("ai.settings.agentInstall.stepAuth") }}</li>
        <li>{{ t("ai.settings.agentInstall.stepRescan") }}</li>
        <li>{{ t("ai.settings.agentInstall.stepSelect") }}</li>
      </ol>

      </div>
      <section v-if="draft && isCli(draft) && (selectedAgent || showCustomCmd || (draft.command || '').trim())" class="editor dock">
        <header class="byok-head">
          <div>
            <h3>
              {{ selectedAgent?.label || draft.name || t("ai.settings.localCli") }}
              <span v-if="isActive" class="pill">{{ t("ai.settings.active") }}</span>
            </h3>
            <p v-if="selectedAgent?.path" class="hint mono truncate" :title="selectedAgent.path">{{ selectedAgent.path }}</p>
          </div>
          <button
            class="btn btn-sm"
            :disabled="testing || !canTest"
            :title="canTestWhy"
            @click="test"
          >
            <Icon :name="testing ? 'RefreshCw' : 'Zap'" :class="{ spin: testing }" />
            {{ testing ? t("ai.settings.testing") : t("ai.settings.test") }}
          </button>
        </header>
        <p v-if="testLine" class="test-line" :class="{ ok: testOk, fail: !testOk }">{{ testLine }}</p>
        <div class="field">
          <span class="lab">{{ t("ai.settings.model") }}</span>
          <div class="keyrow">
            <input
              v-model="draft.model"
              class="input mono"
              list="ai-models-cli"
              :placeholder="t('ai.settings.modelOptional')"
              spellcheck="false"
              @input="markDirty"
              @blur="saveOnBlur"
            />
            <datalist id="ai-models-cli">
              <option v-for="m in modelOptions" :key="m" :value="m" />
            </datalist>
            <button
              v-if="showFetchModels"
              class="btn btn-icon"
              type="button"
              :disabled="fetching"
              :title="t('ai.settings.fetchModels')"
              @click="fetchModels"
            >
              <Icon name="RefreshCw" :class="{ spin: fetching }" />
            </button>
          </div>
          <div v-if="modelOptions.length" class="model-picks">
            <button
              v-for="m in modelOptions.slice(0, 10)"
              :key="m"
              type="button"
              class="chip"
              :class="{ on: draft.model === m }"
              @click="pickModel(m)"
            >
              {{ m }}
            </button>
          </div>
        </div>
        <button type="button" class="adv" @click="showCustomCmd = !showCustomCmd">
          {{ showCustomCmd ? t("ai.settings.hideCustomCmd") : t("ai.settings.showCustomCmd") }}
        </button>
        <div v-if="showCustomCmd" class="field">
          <span class="lab">{{ t("ai.settings.command") }}</span>
          <input
            v-model="draft.command"
            class="input mono"
            :placeholder="t('ai.settings.commandPh')"
            spellcheck="false"
            @input="markDirty"
            @blur="saveOnBlur"
          />
          <p class="hint">{{ t("ai.settings.commandHint") }}</p>
        </div>
      </section>
    </div>

    <div v-else class="pane scroll-y">
      <div class="chip-stick">
      <div class="chip-block">
        <span class="chip-lab">{{ t("ai.settings.chipCloud") }}</span>
        <div class="chips" role="tablist">
          <button
            v-for="p in cloudProviders"
            :key="p.id"
            type="button"
            class="chip"
            :class="{ on: draft?.platform === p.id }"
            @click="setApiProvider(p.id)"
          >
            <span class="chip-dot" :class="{ on: providerConfigured(p.id) }" />
            {{ platformLabel(p.id) }}
          </button>
        </div>
      </div>
      <div v-if="localHttpProviders.length" class="chip-block">
        <span class="chip-lab">{{ t("ai.settings.chipLocalHttp") }}</span>
        <div class="chips" role="tablist">
          <button
            v-for="p in localHttpProviders"
            :key="p.id"
            type="button"
            class="chip"
            :class="{ on: draft?.platform === p.id }"
            @click="setApiProvider(p.id)"
          >
            <span class="chip-dot" :class="{ on: providerConfigured(p.id) }" />
            {{ platformLabel(p.id) }}
          </button>
        </div>
      </div>
      </div>

      <p v-if="draft && noKeyProvider(draft.platform)" class="hint">{{ t("ai.settings.localHttpHint") }}</p>
      <section v-if="draft && !isCli(draft)" class="byok">
        <header class="byok-head">
          <div>
            <h3>
              {{ platformLabel(draft.platform) }}
              <span v-if="isActive" class="pill">{{ t("ai.settings.active") }}</span>
            </h3>
            <p class="hint">{{ t("ai.settings.byokHint") }}</p>
          </div>
          <button
            class="btn btn-sm"
            :disabled="testing || !canTest"
            :title="canTestWhy"
            @click="test"
          >
            <Icon :name="testing ? 'RefreshCw' : 'Zap'" :class="{ spin: testing }" />
            {{ testing ? t("ai.settings.testing") : t("ai.settings.test") }}
          </button>
        </header>
        <p v-if="testLine" class="test-line" :class="{ ok: testOk, fail: !testOk }">{{ testLine }}</p>

        <div v-if="!noKeyProvider(draft.platform)" class="field">
          <span class="labrow">
            <span class="lab">{{ t("ai.settings.apiKey") }}</span>
            <button
              v-if="KEY_LINKS[draft.platform]"
              type="button"
              class="adv"
              @click="SystemService.OpenURL(KEY_LINKS[draft.platform])"
            >
              {{ t("ai.settings.apiKeyGetLink") }}
            </button>
          </span>
          <div class="keyrow">
            <input
              v-model="draft.apiKey"
              class="input mono"
              :type="showKey ? 'text' : 'password'"
              :placeholder="KEY_PH[draft.platform] || t('ai.settings.apiKeyPh')"
              spellcheck="false"
              autocomplete="off"
              @input="markDirty"
              @blur="saveOnBlur"
              @keydown.enter.prevent="test"
            />
            <button class="btn btn-icon" type="button" :title="t('ai.settings.apiKey')" @click="showKey = !showKey">
              <Icon :name="showKey ? 'EyeOff' : 'Eye'" />
            </button>
          </div>
        </div>

        <div class="field">
          <span class="lab">{{ t("ai.settings.model") }}</span>
          <div class="keyrow">
            <input
              v-model="draft.model"
              class="input mono"
              list="ai-models"
              :placeholder="defaultModel(draft.platform) || 'model'"
              spellcheck="false"
              @input="markDirty"
              @blur="saveOnBlur"
            />
            <datalist id="ai-models">
              <option v-for="m in modelOptions" :key="m" :value="m" />
            </datalist>
            <button
              class="btn btn-icon"
              type="button"
              :disabled="fetching"
              :title="t('ai.settings.fetchModels')"
              @click="fetchModels"
            >
              <Icon name="RefreshCw" :class="{ spin: fetching }" />
            </button>
          </div>
          <div v-if="modelOptions.length" class="model-picks">
            <button
              v-for="m in modelOptions.slice(0, 10)"
              :key="m"
              type="button"
              class="chip"
              :class="{ on: draft.model === m }"
              @click="pickModel(m)"
            >
              {{ m }}
            </button>
          </div>
        </div>

        <div v-if="noKeyProvider(draft.platform) || draft.platform === 'custom' || showAdvanced" class="field">
          <span class="lab">{{ t("ai.settings.baseUrl") }}</span>
          <input
            v-model="draft.baseUrl"
            class="input mono"
            :placeholder="defaultBase(draft.platform) || t('ai.settings.baseUrlPh')"
            spellcheck="false"
            @input="markDirty"
            @blur="saveOnBlur"
          />
          <p v-if="!draft.baseUrl && defaultBase(draft.platform)" class="hint">
            {{ t("ai.settings.baseUrlDefaultHint", { url: defaultBase(draft.platform) }) }}
          </p>
        </div>
        <button
          v-else
          type="button"
          class="adv"
          @click="showAdvanced = true"
        >
          {{ t("ai.settings.showAdvanced") }}
        </button>

        <button v-if="!showName" type="button" class="adv" @click="showName = true">
          {{ t("ai.settings.displayName") }}
        </button>
        <div v-else class="field">
          <span class="lab">{{ t("ai.settings.displayName") }}</span>
          <input
            v-model="draft.name"
            class="input"
            :placeholder="t('ai.settings.namePh')"
            spellcheck="false"
            @input="markDirty"
            @blur="saveOnBlur"
          />
        </div>
      </section>
    </div>

    <footer v-if="draft" class="foot">
      <button class="btn btn-primary" :disabled="saving || !dirty" @click="save(false)">
        {{ dirty ? t("common.save") : t("ai.settings.saved") }}
      </button>
      <span v-if="isActive && !dirty" class="hint">{{ t("ai.settings.active") }}</span>
      <span class="grow" />
      <button v-if="draft.id" class="btn btn-quiet" @click="remove">
        <Icon name="Trash2" /> {{ t("ai.settings.remove") }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.exec {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--s-2);
}

.sticky {
  flex-shrink: 0;
  padding: 12px 16px 10px;
  background: var(--s-2);
  border-bottom: 1px solid var(--line-2);
}

.seg.dual {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
}

.seg.dual button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-height: 44px;
  height: auto;
  padding: 7px 12px;
}

.seg-title {
  font-size: 13px;
  font-weight: 650;
}

.seg-meta {
  font-size: 11px;
  color: var(--ink-3);
  font-weight: 500;
}

.pane {
  flex: 1;
  min-height: 0;
  padding: 12px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pane.cli {
  padding-bottom: 0;
  gap: 0;
}

.pane-scroll {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 12px;
}

.path-hint {
  margin: 0;
  max-width: 72ch;
}

.chip-stick {
  position: sticky;
  top: -12px;
  z-index: 2;
  margin: -4px -4px 0;
  padding: 4px 4px 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: color-mix(in srgb, var(--s-2) 92%, transparent);
  backdrop-filter: blur(10px);
}

.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}

.group-head h3 {
  flex: 1;
  margin: 0;
  font-size: 12px;
  font-weight: 650;
  color: var(--ink-3);
}

.group-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notice {
  font-size: 11px;
  font-weight: 550;
}

.notice.ok { color: var(--ok); }
.notice.fail { color: var(--fail); }

.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
  gap: 8px;
}

.agent-grid.compact {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  margin-top: 8px;
}

.agent-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  background: var(--s-1);
  color: var(--ink-2);
  text-align: left;
  font-family: var(--f-ui);
  box-shadow: var(--e-1);
  cursor: pointer;
  transition: border-color 0.14s var(--ease), background 0.14s var(--ease),
    box-shadow 0.14s var(--ease), transform 0.14s var(--ease-out);
}

.agent-card:hover {
  border-color: var(--acc-line);
  transform: translateY(-1px);
}

.agent-card:focus-visible {
  outline: 2px solid var(--acc);
  outline-offset: 2px;
}

.agent-card.on {
  border-color: var(--acc-line);
  background: var(--acc-wash);
  box-shadow: none;
  padding-right: 56px;
}

.agent-card.miss {
  box-shadow: none;
  background: color-mix(in srgb, var(--s-1) 70%, var(--s-2));
}

.agent-card.miss:hover {
  transform: none;
}

.agent-card.miss > :deep(svg) {
  width: 12px;
  height: 12px;
  margin-left: auto;
  align-self: center;
  color: var(--ink-4);
}

.agent-ico {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--s-3);
  color: var(--ink-2);
}

.agent-card.on .agent-ico {
  background: var(--acc-wash-2);
  color: var(--acc);
}

.agent-ico :deep(svg) {
  width: 16px;
  height: 16px;
}

.agent-body {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.agent-name {
  font-size: 13px;
  font-weight: 650;
  color: var(--ink);
}

.agent-tagline {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--ink-3);
}

.agent-meta {
  font-size: 11px;
  color: var(--ink-3);
  font-family: var(--f-mono);
}

.agent-use {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 1px 7px;
  border-radius: var(--r-pill);
  background: var(--acc);
  color: var(--acc-ink);
  font-size: 10px;
  font-weight: 650;
}

.skel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.skel span {
  height: 62px;
  border-radius: var(--r);
  background: linear-gradient(90deg, var(--s-3) 25%, var(--s-1) 50%, var(--s-3) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s linear infinite;
}

.empty-card {
  padding: 16px;
  border: 1px dashed var(--line);
  border-radius: var(--r);
  background: var(--s-1);
  color: var(--ink-3);
  font-size: 13px;
}

.missing-fold {
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  background: color-mix(in srgb, var(--s-1) 55%, transparent);
  padding: 8px 10px 10px;
}

.missing-fold summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
  color: var(--ink-3);
  list-style: none;
}

.missing-fold summary::-webkit-details-marker { display: none; }

.missing-fold summary::before {
  content: "";
  width: 6px;
  height: 6px;
  margin-top: 0.35em;
  border-right: 1.5px solid var(--ink-3);
  border-bottom: 1.5px solid var(--ink-3);
  transform: rotate(-45deg);
  transition: transform 0.16s var(--ease-out);
}

.missing-fold[open] summary::before {
  transform: rotate(45deg);
}

.missing-fold summary .hint {
  font-weight: 500;
}

.install-steps {
  margin: 0;
  padding-left: 18px;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 1.7;
}

.model-picks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.model-picks .chip {
  max-width: 100%;
  height: 24px;
  padding: 0 9px;
  font-size: 11px;
  font-family: var(--f-mono);
}

.editor.dock {
  flex-shrink: 0;
  margin: 0 -16px;
  border-radius: 0;
  border-left: 0;
  border-right: 0;
  border-bottom: 0;
  box-shadow: none;
}

.editor,
.byok {
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--s-1);
  box-shadow: var(--e-1);
}

.byok-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.byok-head > div { flex: 1; min-width: 0; }

.byok-head h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 700;
}

.pill {
  padding: 1px 7px;
  border-radius: var(--r-pill);
  background: var(--acc-wash);
  color: var(--acc);
  font-size: 10px;
  font-weight: 650;
}

.labrow {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.labrow .lab { flex: 1; }

.chip-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chip-lab {
  font-size: 11px;
  font-weight: 650;
  color: var(--ink-3);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ink-4);
}

.chip-dot.on {
  background: var(--ok);
}

.keyrow {
  display: flex;
  gap: 6px;
}

.test-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
}

.test-line.ok { color: var(--ok); }
.test-line.fail { color: var(--fail); }
.test-line.inline {
  max-width: 36ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adv {
  align-self: flex-start;
  border: 0;
  background: transparent;
  color: var(--ink-3);
  font-family: var(--f-ui);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.adv:hover { color: var(--acc); }

.foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px 12px;
  border-top: 1px solid var(--line-2);
  background: var(--s-2);
}

.grow { flex: 1; }

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
</style>
