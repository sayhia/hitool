<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import PanelPage from "../../work/PanelPage.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { analysePassword, generateBatch, generatePassphrase, generatePassword, generatePIN } from "../../lib/passwordStrength";

type Mode = "password" | "passphrase" | "pin";

const mode = ref<Mode>("password");
const length = ref(16);
const useUpper = ref(true);
const useLower = ref(true);
const useDigits = ref(true);
const useSymbols = ref(true);
const customChars = ref("");
const excludeSimilar = ref(false);
const password = ref("");
const history = ref<string[]>([]);

const passphraseWords = ref(4);
const passphraseSep = ref("-");
const SEPS = ["-", ".", "_", " ", "+"];

const pinLength = ref(6);

const batchCount = ref(5);
const batchResults = ref<string[]>([]);

const HINT_KEYS = ["hint1", "hint2", "hint3", "hint4"] as const;

function currentOpts() {
  return {
    length: length.value,
    upper: useUpper.value,
    lower: useLower.value,
    digits: useDigits.value,
    symbols: useSymbols.value,
    custom: customChars.value || undefined,
    excludeSimilar: excludeSimilar.value,
  };
}

function generate() {
  let pw: string;
  if (mode.value === "passphrase") pw = generatePassphrase(passphraseWords.value, passphraseSep.value);
  else if (mode.value === "pin") pw = generatePIN(pinLength.value);
  else pw = generatePassword(currentOpts());
  password.value = pw;
  history.value = [pw, ...history.value.filter((p) => p !== pw)].slice(0, 12);
}

function generateBatchPasswords() {
  if (mode.value === "passphrase") {
    batchResults.value = Array.from({ length: batchCount.value }, () =>
      generatePassphrase(passphraseWords.value, passphraseSep.value),
    );
  } else if (mode.value === "pin") {
    batchResults.value = Array.from({ length: batchCount.value }, () => generatePIN(pinLength.value));
  } else {
    batchResults.value = generateBatch(batchCount.value, currentOpts());
  }
}

function copyAllBatch() {
  if (!batchResults.value.length) return;
  copyText(batchResults.value.join("\n"), t("common.copied"));
}

const inspect = ref("");
const shown = computed(() => inspect.value || password.value);
const analysis = computed(() => analysePassword(shown.value));
const crack = computed(() =>
  shown.value ? t(`pstr.crack.${crackLabel(analysis.value.crackSeconds)}`) : "—",
);

function crackLabel(s: number): string {
  if (s < 1) return "instant";
  if (s < 60) return "seconds";
  if (s < 3600) return "minutes";
  if (s < 86400) return "hours";
  if (s < 31536000) return "days";
  if (s < 31536000 * 1e6) return "years";
  return "ages";
}

function copy(value = password.value) {
  return copyText(value, t("common.copied"));
}

const TOGGLES = [
  { key: "upper", model: useUpper },
  { key: "lower", model: useLower },
  { key: "digits", model: useDigits },
  { key: "symbols", model: useSymbols },
] as const;

watch(
  [mode, length, useUpper, useLower, useDigits, useSymbols, customChars, excludeSimilar, passphraseWords, passphraseSep, pinLength],
  () => {
    if (mode.value === "password" || mode.value === "pin" || inspect.value === "") generate();
  },
);

onMounted(generate);
</script>

<template>
  <PanelPage tool-id="password-gen">
    <div class="mode-tabs">
      <button class="chip" :class="{ on: mode === 'password' }" @click="mode = 'password'">
        {{ t("calc.password.modePw") }}
      </button>
      <button class="chip" :class="{ on: mode === 'passphrase' }" @click="mode = 'passphrase'">
        {{ t("calc.password.modePhrase") }}
      </button>
      <button class="chip" :class="{ on: mode === 'pin' }" @click="mode = 'pin'">
        {{ t("calc.password.modePin") }}
      </button>
    </div>

    <div class="readout">
      <span class="pw mono">{{ password || "—" }}</span>
      <button class="btn btn-sm btn-icon" :title="t('calc.password.generate')" @click="generate">
        <Icon name="RefreshCw" />
      </button>
      <button class="btn btn-sm btn-signal copy" @click="copy()">
        <Icon name="Copy" /> {{ t("common.copy") }}
      </button>
    </div>

    <template v-if="mode === 'password'">
      <div class="field">
        <span class="lab">{{ t("calc.password.length") }} · <span class="mono">{{ length }}</span></span>
        <input v-model.number="length" type="range" min="6" max="64" class="slider" />
      </div>

      <div class="field">
        <span class="lab">{{ t("calc.password.charset") }}</span>
        <div class="toggles">
          <button
            v-for="tg in TOGGLES"
            :key="tg.key"
            class="chip"
            :class="{ on: tg.model.value }"
            @click="tg.model.value = !tg.model.value"
          >
            {{ t(`calc.password.${tg.key}`) }}
          </button>
          <button class="chip" :class="{ on: excludeSimilar }" @click="excludeSimilar = !excludeSimilar">
            {{ t("calc.password.excludeSimilar") }}
          </button>
        </div>
      </div>

      <div class="field">
        <span class="lab">{{ t("calc.password.custom") }}</span>
        <input
          v-model="customChars"
          class="input mono"
          :placeholder="t('calc.password.customPh')"
          autocomplete="off"
          spellcheck="false"
        />
      </div>
    </template>

    <template v-if="mode === 'passphrase'">
      <div class="field">
        <span class="lab">{{ t("calc.password.wordCount") }} · <span class="mono">{{ passphraseWords }}</span></span>
        <input v-model.number="passphraseWords" type="range" min="3" max="10" class="slider" />
      </div>

      <div class="field">
        <span class="lab">{{ t("calc.password.separator") }}</span>
        <div class="toggles">
          <button
            v-for="s in SEPS"
            :key="s"
            class="chip"
            :class="{ on: passphraseSep === s }"
            @click="passphraseSep = s"
          >
            <span class="mono">{{ s === " " ? t("calc.password.sepSpace") : s }}</span>
          </button>
        </div>
      </div>
    </template>

    <template v-if="mode === 'pin'">
      <div class="field">
        <span class="lab">{{ t("calc.password.pinLength") }} · <span class="mono">{{ pinLength }}</span></span>
        <input v-model.number="pinLength" type="range" min="4" max="12" class="slider" />
      </div>
    </template>

    <div class="field">
      <span class="lab">{{ t("pstr.input") }}</span>
      <input
        v-model="inspect"
        class="input mono"
        :placeholder="t('pstr.ph')"
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <div class="meter" :class="`s${analysis.score}`">
      <span v-for="i in 5" :key="i" class="notch" :class="{ on: shown && i <= analysis.score + 1 }"></span>
      <span class="grade">{{ shown ? t(`pstr.grade${analysis.score}`) : "" }}</span>
    </div>
    <p v-if="shown" class="hint">{{ t("pstr.crackTime") }} · {{ crack }} · {{ analysis.entropy }} bit</p>
    <ul v-if="shown && analysis.hints.length" class="hints">
      <li v-for="h in analysis.hints" :key="h">{{ t(`pstr.hint.${h}`) }}</li>
    </ul>

    <!-- Batch generation -->
    <div class="field">
      <div class="batch-head">
        <span class="lab">{{ t("calc.password.batch") }}</span>
        <div class="batch-controls">
          <input v-model.number="batchCount" type="number" min="1" max="50" class="batch-num mono" />
          <button class="btn btn-sm" @click="generateBatchPasswords">
            <Icon name="Layers" /> {{ t("calc.password.batchGen") }}
          </button>
          <button v-if="batchResults.length > 1" class="btn btn-sm btn-quiet" @click="copyAllBatch">
            <Icon name="Copy" /> {{ t("calc.password.batchCopyAll") }}
          </button>
        </div>
      </div>
      <div v-if="batchResults.length" class="batch-list">
        <button
          v-for="p in batchResults"
          :key="p"
          class="hist-row"
          :title="t('common.copy')"
          @click="copy(p)"
        >
          <span class="mono">{{ p }}</span>
          <Icon name="Copy" />
        </button>
      </div>
    </div>

    <!-- Recent candidates -->
    <div v-if="history.length > 1" class="field">
      <div class="hist-head">
        <span class="lab">{{ t("calc.password.history") }}</span>
        <button class="btn btn-sm btn-quiet" @click="history = password ? [password] : []">
          <Icon name="Trash2" /> {{ t("calc.password.clearHistory") }}
        </button>
      </div>
      <div class="hist">
        <button
          v-for="(p, i) in history"
          :key="p"
          class="hist-row"
          :class="{ cur: i === 0 }"
          :title="t('common.copy')"
          @click="copy(p)"
        >
          <span class="mono">{{ p }}</span>
          <Icon name="Copy" />
        </button>
      </div>
    </div>

    <div class="field">
      <span class="lab">{{ t("calc.password.hints") }}</span>
      <ul class="hints">
        <li v-for="k in HINT_KEYS" :key="k">{{ t(`calc.password.${k}`) }}</li>
      </ul>
    </div>
  </PanelPage>
</template>

<style scoped>
.mode-tabs {
  display: flex;
  gap: 6px;
  padding: 0 10px 8px;
}

.readout {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px 10px 14px;
  background: var(--s-2);
}

.pw {
  flex: 1;
  min-width: 0;
  font-size: 19px;
  font-weight: 600;
  word-break: break-all;
  user-select: text;
}

.copy {
  height: 24px;
}

.slider {
  width: 100%;
  max-width: 340px;
  accent-color: var(--acc);
}

.toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.meter {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 560px;
}
.meter .notch {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--s-3);
}
.meter .grade { margin-left: 10px; font-size: var(--t-sm); font-weight: 600; white-space: nowrap; }
.meter.s0 .notch.on, .meter.s1 .notch.on { background: var(--fail); }
.meter.s2 .notch.on { background: var(--warn); }
.meter.s3 .notch.on, .meter.s4 .notch.on { background: var(--ok); }

.batch-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.batch-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.batch-num {
  width: 52px;
  padding: 2px 6px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--s-1);
  color: var(--ink);
  font-size: 13px;
  text-align: center;
}

.batch-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1px;
  background: var(--line-2);
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
  margin-top: 6px;
}

.hist-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hist-head .btn {
  margin-left: auto;
}

.hist {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1px;
  background: var(--line-2);
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
}

.hist-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border: 0;
  background: var(--s-1);
  cursor: pointer;
  font-family: var(--f-ui);
  text-align: left;
}

.hist-row:hover {
  background: var(--s-3);
}

.hist-row.cur {
  background: var(--s-3);
}

.hist-row span {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
}

.hist-row :deep(svg) {
  width: 11px;
  height: 11px;
  color: var(--ink-3);
  opacity: 0;
  flex-shrink: 0;
}

.hist-row:hover :deep(svg) {
  opacity: 1;
}

.hints {
  margin: 0;
  padding-left: 17px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-width: 560px;
}

.hints li {
  font-size: 12px;
  color: var(--ink-2);
  line-height: 1.55;
}
</style>
