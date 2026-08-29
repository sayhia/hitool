<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import PanelPage from "../../work/PanelPage.vue";
import Icon from "../../components/Icon.vue";
import { t, lang } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import {
  DATE_EXAMPLES,
  SNIPPETS,
  TS_EXAMPLES,
  detectUnit,
  formats,
  parseLoose,
  relative,
  toDate,
} from "../../lib/datetime";

const now = ref(new Date());
const timer = setInterval(() => (now.value = new Date()), 1000);
onBeforeUnmount(() => clearInterval(timer));

const unit = ref<"auto" | "s" | "ms">("auto");
const tsInput = ref(String(Math.floor(Date.now() / 1000)));
const dateInput = ref("");

const nowS = computed(() => Math.floor(now.value.getTime() / 1000));
const nowMs = computed(() => now.value.getTime());

/** Which unit is actually in play for the current input. */
const effectiveUnit = computed<"s" | "ms">(() => {
  if (unit.value !== "auto") return unit.value;
  const n = Number(tsInput.value.trim());
  return isFinite(n) ? detectUnit(n) : "s";
});

const tsResult = computed(() => {
  const raw = tsInput.value.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!isFinite(n)) return { error: t("calc.timestamp.notNumber") };
  const d = toDate(n, unit.value);
  if (isNaN(d.getTime())) return { error: t("calc.timestamp.outOfRange") };
  return { date: d, rows: formats(d), rel: relative(d, now.value, lang.value) };
});

const dateResult = computed(() => {
  const raw = dateInput.value.trim();
  if (!raw) return null;
  const d = parseLoose(raw);
  if (!d) return { error: t("calc.timestamp.badDate") };
  return { date: d, rows: formats(d), rel: relative(d, now.value, lang.value) };
});

function useNowForTs() {
  tsInput.value = String(effectiveUnit.value === "ms" ? nowMs.value : nowS.value);
}

function useNowForDate() {
  const d = now.value;
  const p = (n: number) => String(n).padStart(2, "0");
  dateInput.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
</script>

<template>
  <PanelPage tool-id="timestamp-calc" wide>
    <!-- Live clock: both units at once, so neither needs a mode switch. -->
    <div class="clock">
      <button class="cell" :title="t('common.copy')" @click="copyText(String(nowS), t('common.copied'))">
        <span class="value mono">{{ nowS }}</span>
        <span class="lab">{{ t("calc.timestamp.now") }} · {{ t("calc.timestamp.seconds") }}</span>
      </button>
      <button class="cell" :title="t('common.copy')" @click="copyText(String(nowMs), t('common.copied'))">
        <span class="value mono">{{ nowMs }}</span>
        <span class="lab">{{ t("calc.timestamp.now") }} · {{ t("calc.timestamp.millis") }}</span>
      </button>
      <div class="cell flat">
        <span class="valsm mono">{{ formats(now)[2].value }}</span>
        <span class="lab">{{ t("calc.timestamp.localNow") }}</span>
      </div>
    </div>

    <!-- timestamp → date -->
    <div class="conv">
      <div class="conv-head">
        <span class="lab">{{ t("calc.timestamp.ts2date") }}</span>
        <div class="seg unitseg">
          <button :class="{ on: unit === 'auto' }" @click="unit = 'auto'">
            {{ t("calc.timestamp.auto") }}
          </button>
          <button :class="{ on: unit === 's' }" @click="unit = 's'">s</button>
          <button :class="{ on: unit === 'ms' }" @click="unit = 'ms'">ms</button>
        </div>
        <span v-if="unit === 'auto' && tsInput.trim()" class="lab detected">
          {{ t("calc.timestamp.detected", { unit: effectiveUnit }) }}
        </span>
      </div>

      <div class="line">
        <input v-model="tsInput" class="input mono grow" spellcheck="false" />
        <button class="btn btn-sm" @click="useNowForTs">{{ t("calc.timestamp.useNow") }}</button>
        <button class="btn btn-sm btn-quiet" :disabled="!tsInput" @click="tsInput = ''">
          <Icon name="X" />
        </button>
      </div>

      <div class="chips">
        <button v-for="ex in TS_EXAMPLES" :key="ex.value" class="chip" @click="tsInput = ex.value">
          {{ ex.label }}
        </button>
      </div>

      <p v-if="tsResult?.error" class="stripe fail">{{ tsResult.error }}</p>
      <template v-else-if="tsResult">
        <p class="rel">{{ tsResult.rel }}</p>
        <div class="fmt">
          <button
            v-for="r in tsResult.rows"
            :key="r.key"
            class="fmt-row"
            :title="t('common.copy')"
            @click="copyText(r.value, t('common.copied'))"
          >
            <span class="fmt-label">{{ r.label }}</span>
            <code class="fmt-val mono">{{ r.value }}</code>
            <Icon name="Copy" />
          </button>
        </div>
      </template>
    </div>

    <!-- date → timestamp -->
    <div class="conv">
      <div class="conv-head">
        <span class="lab">{{ t("calc.timestamp.date2ts") }}</span>
      </div>
      <div class="line">
        <input
          v-model="dateInput"
          class="input mono grow"
          :placeholder="t('calc.timestamp.datePh')"
          spellcheck="false"
        />
        <button class="btn btn-sm" @click="useNowForDate">{{ t("calc.timestamp.useNow") }}</button>
        <button class="btn btn-sm btn-quiet" :disabled="!dateInput" @click="dateInput = ''">
          <Icon name="X" />
        </button>
      </div>

      <div class="chips">
        <button v-for="ex in DATE_EXAMPLES" :key="ex.value" class="chip" @click="dateInput = ex.value">
          {{ ex.label }}
        </button>
      </div>

      <p v-if="dateResult?.error" class="stripe fail">{{ dateResult.error }}</p>
      <template v-else-if="dateResult">
        <p class="rel">{{ dateResult.rel }}</p>
        <div class="fmt">
          <button
            v-for="r in dateResult.rows"
            :key="r.key"
            class="fmt-row"
            :title="t('common.copy')"
            @click="copyText(r.value, t('common.copied'))"
          >
            <span class="fmt-label">{{ r.label }}</span>
            <code class="fmt-val mono">{{ r.value }}</code>
            <Icon name="Copy" />
          </button>
        </div>
      </template>
    </div>

    <!-- language snippets -->
    <div class="conv">
      <span class="lab">{{ t("calc.timestamp.snippets") }}</span>
      <div class="snips">
        <button
          v-for="s in SNIPPETS"
          :key="s.label"
          class="snip"
          :title="t('common.copy')"
          @click="copyText(s.code, t('common.copied'))"
        >
          <span class="snip-lang">{{ s.label }}</span>
          <code class="mono">{{ s.code }}</code>
        </button>
      </div>
    </div>
  </PanelPage>
</template>

<style scoped>
/* Live clock head: two copyable meter cells plus the human-readable form. */
.clock {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
}

.cell {
  background: var(--s-2);
  padding: 11px 13px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  align-items: flex-start;
  border: 0;
  font-family: var(--f-ui);
  text-align: left;
  cursor: pointer;
}

.cell.flat {
  cursor: default;
}

.cell:not(.flat):hover {
  background: var(--s-3);
}

.value {
  font-size: 21px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--ink);
}

.valsm {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--ink);
}

.conv {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-2);
  padding: 11px 13px;
}

.conv-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.unitseg {
  width: 160px;
}

.detected {
  text-transform: none;
  color: var(--acc);
}

.line {
  display: flex;
  align-items: center;
  gap: 7px;
}

.grow {
  flex: 1;
  min-width: 0;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.rel {
  font-size: 13px;
  font-weight: 600;
  color: var(--acc);
}

/* Format table: every row is a one-click copy target. */
.fmt {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1px;
  background: var(--line-2);
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
}

.fmt-row {
  display: flex;
  align-items: baseline;
  gap: 9px;
  padding: 6px 10px;
  background: var(--s-1);
  border: 0;
  cursor: pointer;
  font-family: var(--f-ui);
  text-align: left;
}

.fmt-row:hover {
  background: var(--s-3);
}

.fmt-label {
  flex-shrink: 0;
  width: 108px;
  font-size: 10.5px;
  color: var(--ink-3);
}

.fmt-val {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
}

.fmt-row :deep(svg) {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  color: var(--ink-3);
  opacity: 0;
}

.fmt-row:hover :deep(svg) {
  opacity: 1;
}

.snips {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 6px;
}

.snip {
  display: flex;
  flex-direction: column;
  gap: 1px;
  align-items: flex-start;
  padding: 6px 9px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-1);
  cursor: pointer;
  font-family: var(--f-ui);
  text-align: left;
}

.snip:hover {
  border-color: var(--ink-3);
}

.snip-lang {
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.snip code {
  font-size: 11.5px;
  color: var(--ink);
  word-break: break-all;
}
</style>
