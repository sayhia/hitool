<script setup lang="ts">
import { computed, ref } from "vue";
import PanelPage from "../../work/PanelPage.vue";
import { t } from "../../lib/i18n";
import { calcIit, IIT_BRACKETS } from "../../lib/iit";

const monthly = ref(15000);
const social = ref(1500);
const additional = ref(1500);

const result = computed(() =>
  calcIit({
    monthlyIncome: monthly.value || 0,
    socialMonthly: social.value || 0,
    additionalMonthly: additional.value || 0,
  }),
);

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

const bracketRate = computed(() =>
  result.value.bracket > 0 ? IIT_BRACKETS[result.value.bracket - 1].rate : 0,
);
</script>

<template>
  <PanelPage tool-id="iit-calc">
    <div class="inputs">
      <label class="field">
        <span class="lab">{{ t("calc.iit.monthly") }}</span>
        <input v-model.number="monthly" type="number" min="0" class="input mono" />
      </label>
      <label class="field">
        <span class="lab">{{ t("calc.iit.social") }}</span>
        <input v-model.number="social" type="number" min="0" class="input mono" />
      </label>
      <label class="field">
        <span class="lab">{{ t("calc.iit.additional") }}</span>
        <input v-model.number="additional" type="number" min="0" class="input mono" />
      </label>
    </div>

    <div class="readout">
      <div class="cell">
        <span class="value mono">¥{{ fmt(result.taxable) }}</span>
        <span class="lab">{{ t("calc.iit.taxable") }}</span>
      </div>
      <div class="cell">
        <span class="value mono">¥{{ fmt(result.tax) }}</span>
        <span class="lab">{{ t("calc.iit.tax") }}</span>
      </div>
      <div class="cell">
        <span class="value mono">¥{{ fmt(result.tax / 12) }}</span>
        <span class="lab">{{ t("calc.iit.monthlyTax") }}</span>
      </div>
      <div class="cell">
        <span class="value mono">{{ pct(bracketRate) }}</span>
        <span class="lab">{{ t("calc.iit.bracket") }}</span>
      </div>
      <div class="cell">
        <span class="value mono">{{ pct(result.effectiveRate) }}</span>
        <span class="lab">{{ t("calc.iit.effective") }}</span>
      </div>
      <div class="cell">
        <span class="value mono">¥{{ fmt(result.afterTax) }}</span>
        <span class="lab">{{ t("calc.iit.afterTax") }}</span>
      </div>
    </div>
    <p class="hint">{{ t("calc.iit.hint") }}</p>
  </PanelPage>
</template>

<style scoped>
.inputs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  max-width: 560px;
}

/* Readout panel: one hairline-ruled block, like a meter cluster. */
.readout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
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
}

.value {
  font-size: 21px;
  font-weight: 600;
  line-height: 1.2;
}
</style>
