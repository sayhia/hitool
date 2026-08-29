<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import PanelPage from "../../work/PanelPage.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { analysePassword, crackLabel } from "../../lib/passwordStrength";

const length = ref(16);
const useUpper = ref(true);
const useLower = ref(true);
const useDigits = ref(true);
const useSymbols = ref(true);
const password = ref("");
/** Session-only; never persisted — writing generated secrets to disk is worse
    than losing them on quit. */
const history = ref<string[]>([]);

const HINT_KEYS = ["hint1", "hint2", "hint3", "hint4"] as const;

// Ambiguous glyphs (I/l/1, O/0) are left out so passwords stay transcribable.
const SETS = {
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lower: "abcdefghijkmnopqrstuvwxyz",
  digits: "23456789",
  symbols: "!@#$%^&*_-+=?",
};

function generate() {
  const pools: string[] = [];
  if (useUpper.value) pools.push(SETS.upper);
  if (useLower.value) pools.push(SETS.lower);
  if (useDigits.value) pools.push(SETS.digits);
  if (useSymbols.value) pools.push(SETS.symbols);
  if (!pools.length) {
    password.value = "";
    return;
  }
  const all = pools.join("");
  const rnd = new Uint32Array(length.value);
  crypto.getRandomValues(rnd);
  const chars: string[] = [];
  pools.forEach((p, i) => chars.push(p[rnd[i] % p.length]));
  for (let i = pools.length; i < length.value; i++) chars.push(all[rnd[i] % all.length]);

  const rnd2 = new Uint32Array(chars.length);
  crypto.getRandomValues(rnd2);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd2[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  password.value = chars.join("");
  // Keep the last 12 so a discarded candidate can still be recovered.
  history.value = [password.value, ...history.value.filter((p) => p !== password.value)].slice(0, 12);
}

const inspect = ref("");
const shown = computed(() => inspect.value || password.value);
const analysis = computed(() => analysePassword(shown.value));
const crack = computed(() =>
  shown.value ? t(`pstr.crack.${crackLabel(analysis.value.crackSeconds)}`) : "—",
);

function copy(value = password.value) {
  return copyText(value, t("common.copied"));
}

const TOGGLES = [
  { key: "upper", model: useUpper },
  { key: "lower", model: useLower },
  { key: "digits", model: useDigits },
  { key: "symbols", model: useSymbols },
] as const;

onMounted(generate);
</script>

<template>
  <PanelPage tool-id="password-gen">
    <div class="readout">
      <span class="pw mono">{{ password || "—" }}</span>
      <button class="btn btn-sm btn-icon" :title="t('calc.password.generate')" @click="generate">
        <Icon name="RefreshCw" />
      </button>
      <button class="btn btn-sm btn-signal copy" @click="copy()">
        <Icon name="Copy" /> {{ t("common.copy") }}
      </button>
    </div>

    <div class="field">
      <span class="lab">{{ t("calc.password.length") }} · <span class="mono">{{ length }}</span></span>
      <input
        v-model.number="length"
        type="range"
        min="6"
        max="64"
        class="slider"
        @input="generate"
      />
    </div>

    <div class="field">
      <span class="lab">{{ t("calc.password.charset") }}</span>
      <div class="toggles">
        <button
          v-for="tg in TOGGLES"
          :key="tg.key"
          class="chip"
          :class="{ on: tg.model.value }"
          @click="tg.model.value = !tg.model.value; generate()"
        >
          {{ t(`calc.password.${tg.key}`) }}
        </button>
      </div>
    </div>

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
      <span v-for="i in 5" :key="i" class="seg" :class="{ on: shown && i <= analysis.score + 1 }"></span>
      <span class="grade">{{ shown ? t(`pstr.grade${analysis.score}`) : "" }}</span>
    </div>
    <p v-if="shown" class="hint">{{ t("pstr.crackTime") }} · {{ crack }} · {{ analysis.entropy }} bit</p>
    <ul v-if="shown && analysis.hints.length" class="hints">
      <li v-for="h in analysis.hints" :key="h">{{ t(`pstr.hint.${h}`) }}</li>
    </ul>

    <!-- Recent candidates, so a good one isn't lost by regenerating. -->
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
/* The password itself is the readout — big, mono, and the only thing on its row. */
.readout {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px 10px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r);
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
.meter .seg {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--s-3);
}
.meter .grade { margin-left: 10px; font-size: var(--t-sm); font-weight: 600; white-space: nowrap; }
.meter.s0 .seg.on, .meter.s1 .seg.on { background: var(--fail); }
.meter.s2 .seg.on { background: var(--warn); }
.meter.s3 .seg.on, .meter.s4 .seg.on { background: var(--ok); }

.meter-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.band {
  font-size: 12px;
  font-weight: 600;
}

.band.ok {
  color: var(--ok);
}
.band.warn {
  color: var(--warn);
}
.band.fail {
  color: var(--fail);
}

.bits {
  margin-left: auto;
  text-transform: none;
}

.fill.warn {
  background: var(--warn);
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
