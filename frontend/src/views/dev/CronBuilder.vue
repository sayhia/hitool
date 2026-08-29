<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import {
  FIELDS,
  ORDER,
  PRESETS,
  buildExpression,
  defaultConfig,
  defaultSpec,
  fieldToText,
  formatRun,
  daysConflict,
  nextRuns,
  parseExpression,
  type FieldId,
  type FieldSpec,
  type Mode,
} from "../../lib/cron";

const config = reactive(defaultConfig());
const active = ref<FieldId>("second");
const manual = ref("");
const parseError = ref("");
const copied = ref(false);

/** Expressions people actually reach for, beyond the five quick presets. */
const COOKBOOK = [
  { key: "everySec", expr: "* * * * * ?" },
  { key: "every5s", expr: "0/5 * * * * ?" },
  { key: "every30m", expr: "0 0/30 * * * ?" },
  { key: "hourlyHalf", expr: "0 30 * * * ?" },
  { key: "twiceDaily", expr: "0 0 9,18 * * ?" },
  { key: "workHours", expr: "0 0 9-18 ? * 2-6" },
  { key: "monday", expr: "0 0 0 ? * 2" },
  { key: "weekend", expr: "0 0 10 ? * 1,7" },
  { key: "monthEnd", expr: "0 0 23 28-31 * ?" },
  { key: "quarterly", expr: "0 0 0 1 1,4,7,10 ?" },
  { key: "yearly", expr: "0 0 0 1 1 ?" },
];

const expression = computed(() => buildExpression(config));
const activeMeta = computed(() => FIELDS.find((f) => f.id === active.value)!);
const activeSpec = computed(() => config[active.value]);

const modes = computed<Mode[]>(() => {
  const base: Mode[] = ["every", "range", "step", "list"];
  return activeMeta.value.canUnset ? [...base, "unset"] : base;
});

/** Every legal value of the active field, for the checkbox grid. */
const choices = computed(() => {
  const { min, max } = activeMeta.value;
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
});

const runs = computed(() => nextRuns(config, 5));

// Mirror the built expression into the manual box, except while it holds text
// the user typed that failed to parse — clobbering that would lose their edit.
watch(
  expression,
  (v) => {
    if (!parseError.value) manual.value = v;
  },
  { immediate: true },
);

function setMode(m: Mode) {
  const next = defaultSpec(activeMeta.value, m);
  // Carry over whatever the previous mode had configured.
  Object.assign(next, { ...activeSpec.value, mode: m });
  config[active.value] = next;
}

function toggleValue(v: number) {
  const spec = activeSpec.value;
  if (spec.mode !== "list") setMode("list");
  const list = config[active.value].list;
  config[active.value].list = list.includes(v)
    ? list.filter((x) => x !== v)
    : [...list, v].sort((a, b) => a - b);
}

function applyManual() {
  const cfg = parseExpression(manual.value);
  if (!cfg) {
    parseError.value = t("cron.parseError");
    return;
  }
  parseError.value = "";
  for (const id of ORDER) config[id] = cfg[id];
}

function applyPreset(expr: string) {
  manual.value = expr;
  applyManual();
}

async function copy() {
  await navigator.clipboard.writeText(expression.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1200);
}

function reset() {
  const d = defaultConfig();
  for (const id of ORDER) config[id] = d[id];
  parseError.value = "";
}

function specOf(id: FieldId): FieldSpec {
  return config[id];
}
</script>

<template>
  <ToolFrame tool-id="cron-builder" shape="flow">
    <div class="readout card">
      <code class="expr mono">{{ expression }}</code>
      <button class="btn btn-sm btn-signal" @click="copy">
        <Icon name="Copy" /> {{ copied ? t("common.copied") : t("common.copy") }}
      </button>
    </div>
    <p class="hint">{{ t("cron.quartzNote") }}</p>

    <div class="field">
      <span class="lab">{{ t("cron.expression") }}</span>
      <div class="manual">
        <input
          v-model="manual"
          class="input mono"
          :class="{ bad: !!parseError }"
          :placeholder="t('cron.exprPh')"
          spellcheck="false"
          @keydown.enter="applyManual"
          @input="parseError = ''"
        />
        <button class="btn btn-sm" @click="applyManual">{{ t("cron.parse") }}</button>
        <button class="btn btn-sm btn-quiet btn-icon" :title="t('common.clear')" @click="reset">
          <Icon name="RefreshCw" />
        </button>
      </div>
      <p v-if="parseError" class="err">{{ parseError }}</p>
    </div>

    <div class="build">
      <div class="fields">
        <button
          v-for="f in FIELDS"
          :key="f.id"
          class="fieldrow"
          :class="{ on: active === f.id }"
          @click="active = f.id"
        >
          <span class="fname">{{ t(`cron.${f.id}`) }}</span>
          <code class="fval mono">{{ fieldToText(f.id, specOf(f.id)) }}</code>
        </button>
      </div>

      <div class="editor card">
        <div class="field">
          <span class="lab">{{ t("cron.mode") }} · {{ t(`cron.${active}`) }}</span>
          <div class="seg">
            <button
              v-for="m in modes"
              :key="m"
              :class="{ on: activeSpec.mode === m }"
              @click="setMode(m)"
            >
              {{ m === "every" ? t("cron.modeEvery", { unit: t(`cron.${active}`) }) : t(`cron.mode${m.charAt(0).toUpperCase() + m.slice(1)}`) }}
            </button>
          </div>
        </div>

        <div v-if="activeSpec.mode === 'range'" class="inline">
          <span class="lab">{{ t("cron.rangeFrom") }}</span>
          <input v-model.number="activeSpec.rangeFrom" type="number" class="input mono num" :min="activeMeta.min" :max="activeMeta.max" />
          <span class="lab">{{ t("cron.rangeTo") }}</span>
          <input v-model.number="activeSpec.rangeTo" type="number" class="input mono num" :min="activeMeta.min" :max="activeMeta.max" />
        </div>

        <div v-else-if="activeSpec.mode === 'step'" class="inline">
          <span class="lab">{{ t("cron.stepFrom") }}</span>
          <input v-model.number="activeSpec.stepFrom" type="number" class="input mono num" :min="activeMeta.min" :max="activeMeta.max" />
          <span class="lab">{{ t("cron.stepEvery") }}</span>
          <input v-model.number="activeSpec.stepEvery" type="number" class="input mono num" min="1" :max="activeMeta.max" />
        </div>

        <div v-else-if="activeSpec.mode === 'list'" class="field">
          <span class="lab">{{ t("cron.pick") }}</span>
          <div class="grid">
            <button
              v-for="v in choices"
              :key="v"
              class="cell"
              :class="{ on: activeSpec.list.includes(v) }"
              @click="toggleValue(v)"
            >
              {{ v }}
            </button>
          </div>
        </div>

        <p v-else class="hint">
          {{ activeSpec.mode === "unset" ? t("cron.modeUnset") : t("cron.modeEvery", { unit: t(`cron.${active}`) }) }}
        </p>
      </div>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("cron.nextRuns") }}</span>
      </div>
      <div class="runs scroll-y">
        <div v-if="runs.length" class="runlist">
          <div v-for="(r, i) in runs" :key="i" class="run">
            <span class="idx mono">{{ i + 1 }}</span>
            <span class="mono">{{ formatRun(r) }}</span>
          </div>
        </div>
        <p v-else class="banner fail">{{ t("cron.parseError") }}</p>
        <p v-if="daysConflict(config)" class="banner warn">{{ t("cron.bothDays") }}</p>
      </div>
    </template>

    <template #inspector>
      <InspectorSection :title="t('cron.preset')" icon="Zap">
        <div class="chips">
          <button v-for="p in PRESETS" :key="p.key" class="chip" @click="applyPreset(p.expr)">
            {{ t(`cron.${p.key}`) }}
          </button>
        </div>
      </InspectorSection>

      <InspectorSection :title="t('cron.reference')" icon="BookOpen">
        <div class="cook">
          <button v-for="r in COOKBOOK" :key="r.expr" class="cookrow" @click="applyPreset(r.expr)">
            <code class="mono">{{ r.expr }}</code>
            <span>{{ t(`cron.cb_${r.key}`) }}</span>
          </button>
        </div>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
.readout {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 14px 14px 18px;
}

.expr {
  flex: 1;
  min-width: 0;
  font-size: var(--t-2xl);
  font-weight: 600;
  letter-spacing: 0.04em;
  word-break: break-all;
  user-select: text;
}

.manual {
  display: flex;
  gap: 7px;
}

.manual .input {
  flex: 1;
  min-width: 0;
}

.input.bad {
  border-color: var(--fail);
}

.err {
  font-size: var(--t-xs);
  color: var(--fail);
}

.build {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.fields {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
  background: var(--s-1);
}

.fieldrow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 0;
  border-bottom: 1px solid var(--line-2);
  background: transparent;
  color: var(--ink-2);
  font-family: var(--f-ui);
  font-size: var(--t-sm);
  cursor: pointer;
  text-align: left;
}

.fieldrow:last-child {
  border-bottom: 0;
}

.fieldrow:hover:not(.on) {
  background: var(--s-2);
}

.fieldrow.on {
  background: var(--acc-wash);
  color: var(--acc);
  font-weight: 600;
}

.fname {
  flex: 1;
}

.fval {
  font-size: var(--t-xs);
  color: var(--ink-3);
  background: var(--s-3);
  border-radius: var(--r-pill);
  padding: 1px 8px;
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fieldrow.on .fval {
  background: var(--s-1);
  color: var(--acc);
}

.editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  min-height: 200px;
}

.inline {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}

.num {
  width: 86px;
  text-align: center;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
  gap: 5px;
  max-height: 210px;
  overflow-y: auto;
}

.cell {
  height: 30px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--s-1);
  color: var(--ink-2);
  font-family: var(--f-mono);
  font-size: var(--t-sm);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.cell:hover:not(.on) {
  border-color: var(--ink-4);
  color: var(--ink);
}

.cell.on {
  background: var(--acc);
  border-color: var(--acc);
  color: var(--acc-ink);
  font-weight: 600;
}

.res-head {
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.runs {
  flex: 1;
  padding: 12px 14px;
}

.runlist {
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
  background: var(--s-1);
}

.run {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--line-2);
  font-size: var(--t-sm);
  user-select: text;
}

.run:last-child {
  border-bottom: 0;
}

.idx {
  font-size: var(--t-xs);
  color: var(--ink-3);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.cook {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.cookrow {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: var(--f-ui);
}

.cookrow:hover {
  background: var(--s-3);
}

.cookrow code {
  font-size: var(--t-xs);
  color: var(--acc);
}

.cookrow span {
  font-size: var(--t-xs);
  color: var(--ink-2);
}

@media (max-width: 1100px) {
  .build {
    grid-template-columns: 1fr;
  }
}
</style>
