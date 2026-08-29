<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { emptyMode, fromOctal, toOctal, toSymbolic, type ModeBits, type Rwx } from "../../lib/chmod";

const mode = ref<ModeBits>(fromOctal("755") ?? emptyMode());
const octalIn = ref("755");

watch(mode, (m) => {
  octalIn.value = toOctal(m);
}, { deep: true });

function setOctal() {
  const next = fromOctal(octalIn.value);
  if (next) mode.value = next;
}

const octal = computed(() => toOctal(mode.value));
const symbolic = computed(() => toSymbolic(mode.value));
const groups = computed(() => [
  { id: "u" as const, bits: mode.value.u },
  { id: "g" as const, bits: mode.value.g },
  { id: "o" as const, bits: mode.value.o },
]);

function toggle(who: "u" | "g" | "o", bit: keyof Rwx) {
  mode.value = {
    ...mode.value,
    [who]: { ...mode.value[who], [bit]: !mode.value[who][bit] },
  };
}
</script>

<template>
  <ToolFrame tool-id="chmod-calc" shape="single">
    <div class="grid">
      <div v-for="g in groups" :key="g.id" class="who">
        <span class="lab">{{ t(`chmod.${g.id}`) }}</span>
        <label v-for="bit in (['r', 'w', 'x'] as const)" :key="bit" class="chk">
          <input type="checkbox" :checked="g.bits[bit]" @change="toggle(g.id, bit)" />
          {{ t(`chmod.${bit}`) }}
        </label>
      </div>
    </div>
    <div class="row">
      <div class="field">
        <span class="lab">{{ t("chmod.octal") }}</span>
        <input v-model="octalIn" class="input mono" maxlength="4" @change="setOctal" />
      </div>
      <div class="field">
        <span class="lab">{{ t("chmod.symbolic") }}</span>
        <button class="chip mono" @click="copyText(symbolic, t('common.copied'))">{{ symbolic }}</button>
      </div>
    </div>
    <p class="hint">{{ t("chmod.hint", { octal, symbolic }) }}</p>
  </ToolFrame>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.who {
  display: flex; flex-direction: column; gap: 8px;
  padding: 12px; border-radius: var(--r); background: var(--s-1);
}
.chk { display: flex; align-items: center; gap: 8px; font-size: var(--t-sm); }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.chip { justify-content: flex-start; height: 34px; padding: 0 12px; }
</style>
