<script setup lang="ts">
/**
 * Date calculator: the gap between two dates (with working days) and
 * projecting a date forward/back by days or months. Pure calendar math from
 * lib/dateCalc, no timezone tricks.
 */
import { computed, ref } from "vue";
import PanelPage from "../../work/PanelPage.vue";
import Icon from "../../components/Icon.vue";
import { t, lang } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import {
  addDays,
  addMonths,
  diffCalendar,
  diffDays,
  formatYmd,
  parseYmd,
  workdays,
} from "../../lib/dateCalc";

const todayStr = formatYmd(new Date());

// ---- difference panel ----
const fromStr = ref(todayStr);
const toStr = ref(todayStr);

const diff = computed(() => {
  const a = parseYmd(fromStr.value);
  const b = parseYmd(toStr.value);
  if (!a || !b) return null;
  const days = diffDays(a, b);
  const cal = diffCalendar(a, b);
  return {
    days,
    weeks: Math.round((Math.abs(days) / 7) * 10) / 10,
    work: workdays(a, b),
    months: cal.months,
    extraDays: cal.days,
  };
});

// ---- offset panel ----
const baseStr = ref(todayStr);
const amount = ref(7);
const unit = ref<"day" | "month">("day");
const dirSign = ref<1 | -1>(1);

const offset = computed(() => {
  const d = parseYmd(baseStr.value);
  if (!d || !Number.isFinite(amount.value)) return null;
  const n = dirSign.value * Math.trunc(Math.abs(amount.value));
  const r = unit.value === "day" ? addDays(d, n) : addMonths(d, n);
  const locale = lang.value === "zh" ? "zh-CN" : "en-US";
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(r);
  return { text: formatYmd(r), weekday };
});

function swapDates() {
  [fromStr.value, toStr.value] = [toStr.value, fromStr.value];
}
</script>

<template>
  <PanelPage tool-id="date-calc">
    <!-- difference -->
    <section class="panel">
      <div class="p-head">
        <span class="p-title">{{ t("date.diffTitle") }}</span>
        <button class="btn btn-sm btn-quiet" :title="t('date.swap')" @click="swapDates">
          <Icon name="ArrowDownUp" />
        </button>
      </div>
      <div class="dates">
        <div class="field">
          <span class="lab">{{ t("date.from") }}</span>
          <input v-model="fromStr" type="date" class="input mono" />
        </div>
        <div class="field">
          <span class="lab">{{ t("date.to") }}</span>
          <input v-model="toStr" type="date" class="input mono" />
        </div>
      </div>

      <div v-if="diff" class="readout">
        <button class="cell" :title="t('common.copy')" @click="copyText(String(diff.days), t('common.copied'))">
          <span class="value mono">{{ diff.days }}</span>
          <span class="lab">{{ t("date.days") }}</span>
        </button>
        <div class="cell">
          <span class="value mono">{{ diff.weeks }}</span>
          <span class="lab">{{ t("date.weeks") }}</span>
        </div>
        <button class="cell" :title="t('common.copy')" @click="copyText(String(diff.work), t('common.copied'))">
          <span class="value mono">{{ diff.work }}</span>
          <span class="lab">{{ t("date.workdays") }}</span>
        </button>
        <div class="cell">
          <span class="value mono">
            {{ diff.months ? `${diff.months} ${t("date.monthUnit")}` : "" }}
            {{ diff.months && diff.extraDays ? " " : "" }}
            {{ diff.extraDays ? `${diff.extraDays} ${t("date.dayUnit")}` : "" }}
            {{ !diff.months && !diff.extraDays ? "0" : "" }}
          </span>
          <span class="lab">{{ t("date.months") }}</span>
        </div>
      </div>
      <p v-else class="banner fail"><Icon name="CircleAlert" /> {{ t("date.badDate") }}</p>
    </section>

    <!-- offset -->
    <section class="panel">
      <div class="p-head">
        <span class="p-title">{{ t("date.offsetTitle") }}</span>
      </div>
      <div class="dates">
        <div class="field">
          <span class="lab">{{ t("date.base") }}</span>
          <input v-model="baseStr" type="date" class="input mono" />
        </div>
        <div class="field amt">
          <span class="lab">{{ t("date.amount") }}</span>
          <div class="line">
            <div class="seg dirseg">
              <button :class="{ on: dirSign === -1 }" @click="dirSign = -1">−</button>
              <button :class="{ on: dirSign === 1 }" @click="dirSign = 1">+</button>
            </div>
            <input v-model.number="amount" type="number" min="0" step="1" class="input mono num" />
            <div class="seg">
              <button :class="{ on: unit === 'day' }" @click="unit = 'day'">{{ t("date.dayUnit") }}</button>
              <button :class="{ on: unit === 'month' }" @click="unit = 'month'">{{ t("date.monthUnit") }}</button>
            </div>
          </div>
        </div>
      </div>

      <p v-if="offset" class="result stripe ok">
        <span class="big mono">{{ offset.text }}</span>
        <span class="wk">{{ offset.weekday }}</span>
        <button
          class="btn btn-sm btn-quiet"
          :title="t('common.copy')"
          @click="copyText(offset.text, t('common.copied'))"
        >
          <Icon name="Copy" />
        </button>
      </p>
      <p v-else class="banner fail"><Icon name="CircleAlert" /> {{ t("date.badDate") }}</p>
      <p class="hint">{{ t("date.offsetHint") }}</p>
    </section>
  </PanelPage>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel + .panel {
  margin-top: 6px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.p-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.p-title {
  font-size: var(--t-sm);
  font-weight: 700;
  color: var(--ink-2);
}

.dates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.num {
  width: 90px;
  flex-shrink: 0;
}

.readout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
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
  border: 0;
  text-align: left;
}

button.cell {
  cursor: pointer;
  transition: background 0.14s var(--ease);
}

button.cell:hover {
  background: var(--s-1);
}

.value {
  font-size: var(--t-2xl);
  font-weight: 600;
  line-height: 1.2;
}

.result {
  display: flex;
  align-items: center;
  gap: 10px;
}

.big {
  font-size: var(--t-2xl);
  font-weight: 600;
}

.wk {
  color: var(--ink-3);
  font-size: var(--t-sm);
  flex: 1;
}

@media (max-width: 720px) {
  .dates {
    grid-template-columns: 1fr;
  }
}
</style>
