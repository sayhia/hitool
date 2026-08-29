<script setup lang="ts">
import { computed, ref } from "vue";
import PanelPage from "../../work/PanelPage.vue";
import { t } from "../../lib/i18n";

const height = ref(170);
const weight = ref(60);

const bmi = computed(() => {
  const h = height.value / 100;
  if (!h || !weight.value) return 0;
  return Math.round((weight.value / (h * h)) * 10) / 10;
});

const category = computed(() => {
  const v = bmi.value;
  if (v <= 0) return "";
  if (v < 18.5) return t("calc.bmi.underweight");
  if (v < 24) return t("calc.bmi.normal");
  if (v < 28) return t("calc.bmi.overweight");
  return t("calc.bmi.obese");
});

// Which semantic band the reading falls in — drives the outcome colour.
// Under- and overweight are both deviations, so both read as warn; the scale
// keeps them apart with a hairline instead of a second hue.
const band = computed(() => {
  const v = bmi.value;
  if (v <= 0) return "";
  if (v < 18.5) return "warn";
  if (v < 24) return "ok";
  if (v < 28) return "warn";
  return "fail";
});

// position on the 15–35 scale bar
const pct = computed(() => Math.min(100, Math.max(0, ((bmi.value - 15) / 20) * 100)));

// Segment spans and tick stops of that same 15–35 scale, in percent.
const BANDS = [
  { key: "warn", span: 17.5 },
  { key: "ok", span: 27.5 },
  { key: "warn2", span: 20 },
  { key: "fail", span: 35 },
];
const TICKS = [
  { v: "15", at: 0 },
  { v: "18.5", at: 17.5 },
  { v: "24", at: 45 },
  { v: "28", at: 65 },
  { v: "35", at: 100 },
];
</script>

<template>
  <PanelPage tool-id="bmi-calc">
    <div class="inputs">
      <label class="field">
        <span class="lab">{{ t("calc.bmi.height") }}</span>
        <input v-model.number="height" type="number" min="80" max="250" class="input mono" />
      </label>
      <label class="field">
        <span class="lab">{{ t("calc.bmi.weight") }}</span>
        <input v-model.number="weight" type="number" min="20" max="300" class="input mono" />
      </label>
    </div>

    <div class="gauge">
      <div class="head">
        <span class="value mono" :class="band">{{ bmi || "—" }}</span>
        <span class="lab">{{ t("calc.bmi.result") }}</span>
        <span class="cat" :class="band">{{ category }}</span>
      </div>

      <div class="scale">
        <div class="bar">
          <div v-for="b in BANDS" :key="b.key" class="seg-b" :class="b.key" :style="{ flex: b.span }"></div>
          <div v-if="bmi > 0" class="needle" :style="{ left: pct + '%' }"></div>
        </div>
        <div class="ticks">
          <span v-for="tk in TICKS" :key="tk.v" class="mono" :style="{ left: tk.at + '%' }">{{ tk.v }}</span>
        </div>
      </div>
    </div>
  </PanelPage>
</template>

<style scoped>
.inputs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  max-width: 420px;
}

.gauge {
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-2);
  max-width: 480px;
  overflow: hidden;
}

.head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 13px 14px;
}

.value {
  font-size: 40px;
  font-weight: 600;
  line-height: 1;
}

.cat {
  margin-left: auto;
  font-size: 13px;
  font-weight: 600;
}

.value.ok,
.cat.ok {
  color: var(--ok);
}
.value.warn,
.cat.warn {
  color: var(--warn);
}
.value.fail,
.cat.fail {
  color: var(--fail);
}

/* Band scale: flat washes split by hairlines, with a hard needle for the
   current reading. No gradient — each zone has an edge you can point at. */
.scale {
  padding: 14px;
  border-top: 1px solid var(--line);
}

.bar {
  position: relative;
  display: flex;
  height: 12px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
}

.seg-b {
  border-right: 1px solid var(--line);
}

.seg-b:last-child {
  border-right: 0;
}

.seg-b.warn,
.seg-b.warn2 {
  background: var(--warn-wash);
}
.seg-b.ok {
  background: var(--ok-wash);
}
.seg-b.fail {
  background: var(--fail-wash);
}

.needle {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: var(--ink);
  transform: translateX(-50%);
  transition: left 0.24s ease;
}

.ticks {
  position: relative;
  height: 15px;
  margin-top: 5px;
}

.ticks span {
  position: absolute;
  top: 0;
  font-size: 10px;
  color: var(--ink-3);
  transform: translateX(-50%);
}

.ticks span:first-child {
  transform: none;
}

.ticks span:last-child {
  transform: translateX(-100%);
}
</style>
