<script setup lang="ts">
/**
 * Base conversion on BigInt, so a 64-bit register value doesn't lose its low
 * bits the way a Number would past 2^53.
 */
import { computed, ref } from "vue";
import PanelPage from "../../work/PanelPage.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { RADIXES, formatRadix, parseRadix } from "../../lib/codec";

/** Which field the user is typing in; the others are derived from it. */
const source = ref(10);
const raw = ref("255");
const grouped = ref(true);

const value = computed(() => parseRadix(raw.value, source.value));

const rows = computed(() =>
  RADIXES.map((r) => ({
    ...r,
    text:
      value.value === null
        ? ""
        : formatRadix(value.value, r.base, grouped.value ? r.group : 0),
  })),
);

function onInput(base: number, text: string) {
  source.value = base;
  raw.value = text;
}

const bits = computed(() => {
  const v = value.value;
  if (v === null) return 0;
  const abs = v < 0n ? -v : v;
  return abs === 0n ? 1 : abs.toString(2).length;
});

/** The smallest standard width that fits, so register size is obvious. */
const width = computed(() => [8, 16, 32, 64, 128].find((w) => bits.value <= w) ?? null);
</script>

<template>
  <PanelPage tool-id="radix-calc">
    <div class="fields">
      <div v-for="r in rows" :key="r.base" class="rrow" :class="{ active: source === r.base }">
        <span class="rlabel">
          {{ r.label }}
          <span class="rbase mono">{{ r.base }}</span>
        </span>
        <input
          class="input mono rin"
          :class="{ bad: source === r.base && raw && value === null }"
          :value="source === r.base ? raw : r.text"
          spellcheck="false"
          @input="onInput(r.base, ($event.target as HTMLInputElement).value)"
        />
        <button
          class="btn btn-sm btn-quiet btn-icon"
          :disabled="!r.text"
          :title="t('common.copy')"
          @click="copyText(r.text.replace(/\s/g, ''), t('common.copied'))"
        >
          <Icon name="Copy" />
        </button>
      </div>
    </div>

    <p v-if="raw && value === null" class="banner fail">
      <Icon name="CircleAlert" /> {{ t("radix.invalid", { base: source }) }}
    </p>

    <div v-else-if="value !== null" class="readout">
      <div class="cell">
        <span class="value mono">{{ bits }}</span>
        <span class="lab">{{ t("radix.bits") }}</span>
      </div>
      <div class="cell">
        <span class="value mono">{{ width ? width + " bit" : "—" }}</span>
        <span class="lab">{{ t("radix.width") }}</span>
      </div>
      <div class="cell">
        <span class="value mono">{{ value < 0n ? t("radix.negative") : t("radix.positive") }}</span>
        <span class="lab">{{ t("radix.sign") }}</span>
      </div>
    </div>

    <div class="row">
      <button class="chip" :class="{ on: grouped }" @click="grouped = !grouped">
        {{ t("radix.group") }}
      </button>
      <button class="chip" @click="onInput(10, '')">{{ t("common.clear") }}</button>
    </div>

    <p class="hint">{{ t("radix.hint") }}</p>
  </PanelPage>
</template>

<style scoped>
/* One row per base, all live: type in any of them and the rest follow. */
.fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rrow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-1);
  transition: border-color 0.14s var(--ease), background 0.14s var(--ease);
}

.rrow.active {
  border-color: var(--acc-line);
  background: var(--acc-wash);
}

.rlabel {
  flex-shrink: 0;
  width: 70px;
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: var(--t-sm);
  font-weight: 700;
  color: var(--ink);
}

.rbase {
  font-size: var(--t-xs);
  font-weight: 500;
  color: var(--ink-3);
}

.rin {
  flex: 1;
  min-width: 0;
  font-size: var(--t-lg);
  letter-spacing: 0.04em;
  background: transparent;
  border-color: transparent;
}

.rin:focus {
  background: var(--s-1);
  border-color: var(--acc);
}

.rin.bad {
  border-color: var(--fail);
  color: var(--fail);
}

.readout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
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
  font-size: var(--t-2xl);
  font-weight: 600;
  line-height: 1.2;
}

.row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
