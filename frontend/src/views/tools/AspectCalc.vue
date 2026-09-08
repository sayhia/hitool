<script setup lang="ts">
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { PRESETS, heightForWidth, simplify, widthForHeight } from "../../lib/aspect";

const w = ref(1920);
const h = ref(1080);
const ratio = computed(() => simplify(Number(w.value) || 0, Number(h.value) || 0));

/** Decimal form of the ratio, trailing zeros trimmed — 1920×1080 → 1.7778. */
const decimal = computed(() => {
  const W = Number(w.value);
  const H = Number(h.value);
  if (!W || !H) return "—";
  return (W / H).toFixed(4).replace(/\.?0+$/, "");
});

const orient = computed(() => {
  const W = Number(w.value);
  const H = Number(h.value);
  if (!W || !H) return "square";
  return W > H ? "landscape" : W < H ? "portrait" : "square";
});

const ratioText = computed(() => `${ratio.value.w}:${ratio.value.h}`);

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
      <div class="a-head">
        <span class="lab">{{ t("aspect.ratio") }}</span>
        <span class="a-side">
          <span class="badge acc">{{ t(`aspect.${orient}`) }}</span>
          <span class="badge mono">{{ decimal }}</span>
        </span>
      </div>
      <button class="a-value mono" :title="t('common.copy')" @click="copyText(ratioText, t('common.copied'))">
        {{ ratio.w }}<span class="colon">:</span>{{ ratio.h }}
        <Icon name="Copy" class="a-copy" />
      </button>
    </div>
  </ToolFrame>
</template>

<style scoped>
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* The one moment of the page: the ratio as a big, category-tinted,
   click-to-copy figure with its decimal and orientation alongside. */
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

.a-side {
  display: flex;
  gap: 5px;
}

.a-value {
  display: flex;
  align-items: center;
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

.colon {
  color: var(--ink-4);
  font-weight: 600;
  padding: 0 2px;
}

.a-copy {
  width: 15px;
  height: 15px;
  color: var(--ink-4);
  opacity: 0;
  transition: opacity 0.16s var(--ease);
}

.a-value:hover .a-copy {
  opacity: 1;
}
</style>
