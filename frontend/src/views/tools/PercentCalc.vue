<script setup lang="ts">
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import { t } from "../../lib/i18n";
import { changePercent, isWhatPercent, percentIs, percentOf, roundNice } from "../../lib/percent";

const mode = ref<"of" | "is" | "whole" | "delta">("of");
const a = ref(20);
const b = ref(50);

const result = computed(() => {
  const x = Number(a.value);
  const y = Number(b.value);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "—";
  if (mode.value === "of") return roundNice(percentOf(x, y));
  if (mode.value === "is") return roundNice(isWhatPercent(x, y) ?? NaN);
  if (mode.value === "whole") return roundNice(percentIs(x, y) ?? NaN);
  return roundNice(changePercent(x, y) ?? NaN);
});

const unit = computed(() => (mode.value === "is" || mode.value === "delta" ? "%" : ""));
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
      <span class="lab">{{ t("pct.result") }}</span>
      <strong class="mono">{{ result }}{{ unit }}</strong>
    </div>
  </ToolFrame>
</template>

<style scoped>
.wrap { flex-wrap: wrap; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.answer {
  display: flex; flex-direction: column; gap: 4px;
  padding: 16px; border-radius: var(--r); background: var(--s-1);
}
.answer strong { font-size: 28px; font-weight: 750; letter-spacing: -0.03em; }
</style>
