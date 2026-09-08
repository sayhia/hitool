<script setup lang="ts">
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { changePercent, isWhatPercent, percentIs, percentOf, roundNice } from "../../lib/percent";

const mode = ref<"of" | "is" | "whole" | "delta">("of");
const a = ref(20);
const b = ref(50);

const num = computed(() => {
  const x = Number(a.value);
  const y = Number(b.value);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return NaN;
  if (mode.value === "of") return percentOf(x, y);
  if (mode.value === "is") return isWhatPercent(x, y) ?? NaN;
  if (mode.value === "whole") return percentIs(x, y) ?? NaN;
  return changePercent(x, y) ?? NaN;
});

const result = computed(() => (Number.isFinite(num.value) ? roundNice(num.value) : "—"));
const unit = computed(() => (mode.value === "is" || mode.value === "delta" ? "%" : ""));
const answerText = computed(() => `${result.value}${unit.value}`);

/** The arithmetic the result came from, as a symbolic line under the value. */
const expr = computed(() => {
  const x = Number(a.value);
  const y = Number(b.value);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
  if (mode.value === "of") return `${x} × ${y}%`;
  if (mode.value === "is") return `${x} ÷ ${y} × 100`;
  if (mode.value === "whole") return `${x} ÷ ${y}%`;
  return `(${x} − ${y}) ÷ ${y} × 100`;
});
</script>

<template>
  <ToolFrame tool-id="percent-calc" shape="single">
    <div class="seg wrap">
      <button :class="{ on: mode === 'of' }" @click="mode = 'of'">{{ t("pct.of") }}</button>
      <button :class="{ on: mode === 'is' }" @click="mode = 'is'">{{ t("pct.is") }}</button>
      <button :class="{ on: mode === 'whole' }" @click="mode = 'whole'">{{ t("pct.whole") }}</button>
      <button :class="{ on: mode === 'delta' }" @click="mode = 'delta'">{{ t("pct.delta") }}</button>
    </div>
    <div class="row">
      <div class="field">
        <span class="lab">{{ t(`pct.a.${mode}`) }}</span>
        <input v-model.number="a" class="input mono" type="number" />
      </div>
      <div class="field">
        <span class="lab">{{ t(`pct.b.${mode}`) }}</span>
        <input v-model.number="b" class="input mono" type="number" />
      </div>
    </div>

    <div class="answer">
      <div class="a-head">
        <span class="lab">{{ t("pct.result") }}</span>
        <code v-if="expr" class="mono expr">{{ expr }}</code>
      </div>
      <button
        class="a-value mono"
        :title="t('common.copy')"
        @click="copyText(answerText, t('common.copied'))"
      >
        {{ result }}<span v-if="unit" class="unit">{{ unit }}</span>
        <Icon name="Copy" class="a-copy" />
      </button>
    </div>
  </ToolFrame>
</template>

<style scoped>
.wrap { flex-wrap: wrap; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* Result hero: the number big and category-tinted, the arithmetic that
   produced it trailing in small mono. Click to copy. */
.answer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: var(--r-lg);
  background: var(--s-1);
  border: 1px solid var(--line-2);
  box-shadow: var(--e-1);
}

.a-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.expr {
  font-size: var(--t-sm);
  color: var(--ink-3);
}

.a-value {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  font-size: 34px;
  font-weight: 750;
  letter-spacing: -0.03em;
  line-height: 1.15;
  color: var(--cat);
  cursor: pointer;
  text-align: left;
  align-self: flex-start;
}

.unit {
  font-size: 22px;
  font-weight: 650;
  color: var(--ink-3);
}

.a-copy {
  width: 15px;
  height: 15px;
  align-self: center;
  color: var(--ink-4);
  opacity: 0;
  transition: opacity 0.16s var(--ease);
}

.a-value:hover .a-copy {
  opacity: 1;
}
</style>
