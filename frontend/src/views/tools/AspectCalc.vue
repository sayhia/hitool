<script setup lang="ts">
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import { t } from "../../lib/i18n";
import { PRESETS, heightForWidth, simplify, widthForHeight } from "../../lib/aspect";

const w = ref(1920);
const h = ref(1080);
const ratio = computed(() => simplify(Number(w.value) || 0, Number(h.value) || 0));

function applyPreset(pw: number, ph: number) {
  const curW = Number(w.value) || 1920;
  w.value = curW;
  h.value = Math.round(heightForWidth(curW, pw, ph) ?? ph);
}

function lockWidth() {
  const r = ratio.value;
  h.value = Math.round(heightForWidth(Number(w.value) || 0, r.w, r.h) ?? 0);
}

function lockHeight() {
  const r = ratio.value;
  w.value = Math.round(widthForHeight(Number(h.value) || 0, r.w, r.h) ?? 0);
}
</script>

<template>
  <ToolFrame tool-id="aspect-calc" shape="single">
    <div class="chips">
      <button
        v-for="p in PRESETS"
        :key="p.id"
        type="button"
        class="chip"
        :class="{ on: ratio.w === p.w && ratio.h === p.h }"
        @click="applyPreset(p.w, p.h)"
      >
        {{ p.w }}:{{ p.h }}
      </button>
    </div>
    <div class="row">
      <div class="field">
        <span class="lab">{{ t("aspect.width") }}</span>
        <input v-model.number="w" class="input mono" type="number" min="1" @change="lockWidth" />
      </div>
      <div class="field">
        <span class="lab">{{ t("aspect.height") }}</span>
        <input v-model.number="h" class="input mono" type="number" min="1" @change="lockHeight" />
      </div>
    </div>
    <div class="answer">
      <span class="lab">{{ t("aspect.ratio") }}</span>
      <strong class="mono">{{ ratio.w }}:{{ ratio.h }}</strong>
    </div>
  </ToolFrame>
</template>

<style scoped>
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.answer {
  display: flex; flex-direction: column; gap: 4px;
  padding: 16px; border-radius: var(--r); background: var(--s-1);
}
.answer strong { font-size: 28px; font-weight: 750; letter-spacing: -0.03em; }
</style>
