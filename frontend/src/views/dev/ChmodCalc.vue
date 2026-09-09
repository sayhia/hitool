<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { emptyMode, fromOctal, toOctal, toFullOctal, toSymbolic, toBinary, toChmodCommand, type ModeBits, type Rwx } from "../../lib/chmod";

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
const fullOctal = computed(() => toFullOctal(mode.value));
const symbolic = computed(() => toSymbolic(mode.value));
const binary = computed(() => toBinary(mode.value));
const chmodCmd = computed(() => toChmodCommand(mode.value));

const groups = computed(() => [
  { id: "u" as const, bits: mode.value.u },
  { id: "g" as const, bits: mode.value.g },
  { id: "o" as const, bits: mode.value.o },
]);

const specials = computed(() => [
  { id: "setuid" as const, label: "setuid", bit: mode.value.special.setuid },
  { id: "setgid" as const, label: "setgid", bit: mode.value.special.setgid },
  { id: "sticky" as const, label: "sticky", bit: mode.value.special.sticky },
]);

function toggle(who: "u" | "g" | "o", bit: keyof Rwx) {
  mode.value = {
    ...mode.value,
    [who]: { ...mode.value[who], [bit]: !mode.value[who][bit] },
  };
}

function toggleSpecial(key: "setuid" | "setgid" | "sticky") {
  mode.value = {
    ...mode.value,
    special: { ...mode.value.special, [key]: !mode.value.special[key] },
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

    <div class="special-row">
      <span class="lab">{{ t("chmod.special") }}</span>
      <div class="special-chks">
        <label v-for="s in specials" :key="s.id" class="chk">
          <input type="checkbox" :checked="s.bit" @change="toggleSpecial(s.id)" />
          <code>{{ s.label }}</code>
        </label>
      </div>
    </div>

    <div class="readout">
      <button class="cell big" :title="t('common.copy')" @click="copyText(octal, t('common.copied'))">
        <span class="lab">{{ t("chmod.octal") }}</span>
        <span class="value mono cat">{{ octal }}</span>
      </button>
      <button class="cell big" :title="t('common.copy')" @click="copyText(symbolic, t('common.copied'))">
        <span class="lab">{{ t("chmod.symbolic") }}</span>
        <span class="value mono">{{ symbolic }}</span>
      </button>
    </div>

    <div class="readout secondary">
      <button class="cell big" :title="t('common.copy')" @click="copyText(fullOctal, t('common.copied'))">
        <span class="lab">{{ t("chmod.fullOctal") }}</span>
        <span class="value mono">{{ fullOctal }}</span>
      </button>
      <button class="cell big" :title="t('common.copy')" @click="copyText(binary, t('common.copied'))">
        <span class="lab">{{ t("chmod.binary") }}</span>
        <span class="value mono bin">{{ binary }}</span>
      </button>
    </div>

    <div class="cmd-row">
      <button class="cmd-cell" :title="t('common.copy')" @click="copyText(chmodCmd, t('common.copied'))">
        <Icon name="Terminal" :size="14" />
        <code class="mono">{{ chmodCmd }}</code>
        <Icon name="Copy" :size="13" class="copy-icon" />
      </button>
    </div>

    <div class="field">
      <span class="lab">{{ t("chmod.octal") }}</span>
      <input v-model="octalIn" class="input mono" maxlength="4" @change="setOctal" />
    </div>
    <p class="hint">{{ t("chmod.hint", { octal, symbolic }) }}</p>
  </ToolFrame>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.who {
  display: flex; flex-direction: column; gap: 8px;
  padding: 12px; border-radius: var(--r); background: var(--s-1);
  border: 1px solid var(--line-2);
}
.chk { display: flex; align-items: center; gap: 8px; font-size: var(--t-sm); }
.chk code { font-size: var(--t-sm); }

.special-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0; border-top: 1px solid var(--line-2);
}
.special-chks { display: flex; flex-wrap: wrap; gap: 16px; }

.cell.big {
  border: 0; background: var(--s-2); cursor: pointer;
  font-family: var(--f-ui); transition: background 0.16s var(--ease);
}
.cell.big:hover { background: var(--s-3); }
.value.cat { color: var(--cat); font-weight: 700; font-size: 26px; }
.value.bin { letter-spacing: 0.08em; font-size: var(--t-sm); }

.readout.secondary { margin-top: -1px; }
.readout.secondary .cell.big { background: var(--s-1); }

.cmd-row { padding: 4px 0; }
.cmd-cell {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 8px 12px; border: 1px solid var(--line-2); border-radius: var(--r);
  background: var(--s-1); cursor: pointer; font-family: var(--f-ui);
  transition: background 0.14s var(--ease);
}
.cmd-cell:hover { background: var(--cat-wash); }
.cmd-cell code { flex: 1; font-size: var(--t-sm); text-align: left; }
.copy-icon { color: var(--f-3); flex-shrink: 0; }
</style>
