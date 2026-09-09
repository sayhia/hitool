<script setup lang="ts">
import { computed, ref } from "vue";
import PanelPage from "../../work/PanelPage.vue";
import { t } from "../../lib/i18n";

const principal = ref(100000);
const rate = ref(3.0);
const years = ref(3);
const mode = ref<"simple" | "compound">("compound");

const interest = computed(() => {
  const p = principal.value;
  const r = rate.value / 100;
  const n = years.value;
  if (p <= 0 || r < 0 || n <= 0) return 0;
  const v = mode.value === "simple" ? p * r * n : p * Math.pow(1 + r, n) - p;
  return Math.round(v * 100) / 100;
});

const total = computed(() => Math.round((principal.value + interest.value) * 100) / 100);

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
</script>

<template>
  <PanelPage tool-id="interest-calc">
    <div class="inputs">
      <label class="field">
        <span class="lab">{{ t("calc.interest.principal") }}</span>
        <input v-model.number="principal" type="number" min="0" class="input mono" />
      </label>
      <label class="field">
        <span class="lab">{{ t("calc.interest.rate") }}</span>
        <input v-model.number="rate" type="number" min="0" step="0.05" class="input mono" />
      </label>
      <label class="field">
        <span class="lab">{{ t("calc.interest.years") }}</span>
        <input v-model.number="years" type="number" min="1" max="100" class="input mono" />
      </label>
    </div>

    <div class="seg mode">
      <button :class="{ on: mode === 'simple' }" @click="mode = 'simple'">
        {{ t("calc.interest.simple") }}
      </button>
      <button :class="{ on: mode === 'compound' }" @click="mode = 'compound'">
        {{ t("calc.interest.compound") }}
      </button>
    </div>

    <div class="readout">
      <div class="cell">
        <span class="value mono">{{ fmt(interest) }}</span>
        <span class="lab">{{ t("calc.interest.interest") }}</span>
      </div>
      <div class="cell">
        <span class="value mono">{{ fmt(total) }}</span>
        <span class="lab">{{ t("calc.interest.total") }}</span>
      </div>
    </div>
  </PanelPage>
</template>

<style scoped>
.inputs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.mode {
  width: fit-content;
}

/* Readout panel: one hairline-ruled block, like a meter cluster. */
.readout {
}

</style>
