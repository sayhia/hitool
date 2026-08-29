<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import PanelPage from "../../work/PanelPage.vue";
import { t } from "../../lib/i18n";
import { prepayPlan } from "../../lib/mortgagePrepay";

const amountWan = ref(100); // ×10,000
const rate = ref(3.6);
const years = ref(30);
const method = ref<"equal" | "principal">("equal");
const showPrepay = ref(false);
const prepayAt = ref(24);
const prepayWan = ref(20);
const prepayMode = ref<"shorten" | "reduce">("shorten");

const route = useRoute();
watch(
  () => route.query.prepay,
  (q) => {
    if (q === "1" || q === "true") showPrepay.value = true;
  },
  { immediate: true },
);

const plan = computed(() =>
  showPrepay.value
    ? prepayPlan({
        principal: amountWan.value * 10000,
        annualRate: rate.value,
        months: years.value * 12,
        method: method.value,
        prepayAt: prepayAt.value,
        prepayAmount: prepayWan.value * 10000,
        mode: prepayMode.value,
      })
    : null,
);

const savedLabel = computed(() => {
  const m = plan.value?.savedMonths ?? 0;
  if (m <= 0) return "0";
  const y = Math.floor(m / 12);
  const rest = m % 12;
  if (y && rest) return t("calc.prepay.yearsMonths", { y, m: rest });
  if (y) return t("calc.prepay.yearsOnly", { y });
  return t("calc.prepay.monthsOnly", { m: rest });
});

const calc = computed(() => {
  const principal = amountWan.value * 10000;
  const monthlyRate = rate.value / 100 / 12;
  const months = years.value * 12;
  if (principal <= 0 || months <= 0) {
    return { monthly: 0, first: 0, last: 0, totalInterest: 0, totalPay: 0 };
  }
  if (method.value === "equal") {
    // 等额本息: fixed monthly payment
    const m =
      monthlyRate === 0
        ? principal / months
        : (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
          (Math.pow(1 + monthlyRate, months) - 1);
    const totalPay = m * months;
    return {
      monthly: m,
      first: m,
      last: m,
      totalInterest: totalPay - principal,
      totalPay,
    };
  }
  // 等额本金: fixed principal per month, declining interest
  const basePrincipal = principal / months;
  const first = basePrincipal + principal * monthlyRate;
  const last = basePrincipal + basePrincipal * monthlyRate;
  const totalInterest = ((months + 1) * principal * monthlyRate) / 2;
  return {
    monthly: 0,
    first,
    last,
    totalInterest,
    totalPay: principal + totalInterest,
  };
});

const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 0 });
</script>

<template>
  <PanelPage tool-id="mortgage-calc">
    <div class="inputs">
      <label class="field">
        <span class="lab">{{ t("calc.mortgage.amount") }}</span>
        <input v-model.number="amountWan" type="number" min="1" class="input mono" />
      </label>
      <label class="field">
        <span class="lab">{{ t("calc.mortgage.rate") }}</span>
        <input v-model.number="rate" type="number" min="0" step="0.05" class="input mono" />
      </label>
      <label class="field">
        <span class="lab">{{ t("calc.mortgage.years") }}</span>
        <select v-model.number="years" class="select mono">
          <option v-for="y in [5, 10, 15, 20, 25, 30]" :key="y" :value="y">{{ y }}</option>
        </select>
      </label>
    </div>

    <div class="seg method">
      <button :class="{ on: method === 'equal' }" @click="method = 'equal'">
        {{ t("calc.mortgage.equal") }}
      </button>
      <button :class="{ on: method === 'principal' }" @click="method = 'principal'">
        {{ t("calc.mortgage.principal") }}
      </button>
    </div>

    <div class="readout">
      <div v-if="method === 'equal'" class="cell">
        <span class="value mono">¥{{ fmt(calc.monthly) }}</span>
        <span class="lab">{{ t("calc.mortgage.monthly") }}</span>
      </div>
      <template v-else>
        <div class="cell">
          <span class="value mono">¥{{ fmt(calc.first) }}</span>
          <span class="lab">{{ t("calc.mortgage.firstMonthly") }}</span>
        </div>
        <div class="cell">
          <span class="value mono">¥{{ fmt(calc.last) }}</span>
          <span class="lab">{{ t("calc.mortgage.lastMonthly") }}</span>
        </div>
      </template>
      <div class="cell">
        <span class="value mono">¥{{ fmt(calc.totalInterest) }}</span>
        <span class="lab">{{ t("calc.mortgage.totalInterest") }}</span>
      </div>
      <div class="cell">
        <span class="value mono">¥{{ fmt(calc.totalPay) }}</span>
        <span class="lab">{{ t("calc.mortgage.totalPay") }}</span>
      </div>
    </div>

    <button class="chip" :class="{ on: showPrepay }" @click="showPrepay = !showPrepay">
      {{ t("tools.prepay-calc.name") }}
    </button>

    <template v-if="showPrepay">
      <div class="inputs">
        <label class="field">
          <span class="lab">{{ t("calc.prepay.at") }}</span>
          <input v-model.number="prepayAt" type="number" min="1" class="input mono" />
        </label>
        <label class="field">
          <span class="lab">{{ t("calc.prepay.amount") }}</span>
          <input v-model.number="prepayWan" type="number" min="1" class="input mono" />
        </label>
      </div>
      <div class="seg method">
        <button :class="{ on: prepayMode === 'shorten' }" @click="prepayMode = 'shorten'">{{ t("calc.prepay.shorten") }}</button>
        <button :class="{ on: prepayMode === 'reduce' }" @click="prepayMode = 'reduce'">{{ t("calc.prepay.reduce") }}</button>
      </div>
      <div v-if="plan" class="readout">
        <div class="cell">
          <span class="value mono">¥{{ fmt(plan.newMonthly) }}</span>
          <span class="lab">{{ t("calc.prepay.newMonthly") }}</span>
        </div>
        <div class="cell">
          <span class="value mono">{{ savedLabel }}</span>
          <span class="lab">{{ t("calc.prepay.savedMonths") }}</span>
        </div>
        <div class="cell">
          <span class="value mono">¥{{ fmt(plan.savedInterest) }}</span>
          <span class="lab">{{ t("calc.prepay.savedInterest") }}</span>
        </div>
      </div>
      <p v-else class="hint">{{ t("calc.prepay.invalid") }}</p>
    </template>
  </PanelPage>
</template>

<style scoped>
.inputs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  max-width: 560px;
}

.method {
  max-width: 260px;
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
