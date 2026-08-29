<script setup lang="ts">
/**
 * Renders one manifest-declared setting. Keeping every control shape here is
 * what lets 16 tools be data rather than 16 near-identical Vue files.
 */
import { computed } from "vue";
import { pickDirectory } from "../lib/backend";
import { t, lang } from "../lib/i18n";
import type { Field } from "../tools/manifest";
import Icon from "../components/Icon.vue";

const props = defineProps<{ field: Field }>();
const value = defineModel<any>({ required: true });

/** Manifest labels are i18n keys; options may carry their own. */
const label = computed(() => {
  void lang.value;
  return props.field.label ? t(props.field.label) : "";
});

const options = computed(() => {
  void lang.value;
  return (props.field.options ?? []).map((o) => ({
    value: o.value,
    text: o.label ? t(o.label) : String(o.value),
  }));
});

async function browse() {
  const dir = await pickDirectory(t("bench.chooseOutput"));
  if (dir) value.value = dir;
}

function toggleIn(list: number[], v: number) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v].sort((a, b) => a - b);
}
</script>

<template>
  <div class="field">
    <span v-if="label" class="lab">{{ label }}</span>

    <!-- segmented: few mutually exclusive choices -->
    <div v-if="field.type === 'segment'" class="seg seg-wrap">
      <button
        v-for="o in options"
        :key="String(o.value)"
        type="button"
        :class="{ on: value === o.value }"
        @click="value = o.value"
      >
        {{ o.text }}
      </button>
    </div>

    <!-- select: many choices -->
    <select v-else-if="field.type === 'select'" v-model="value" class="select">
      <option v-for="o in options" :key="String(o.value)" :value="o.value">{{ o.text }}</option>
    </select>

    <!-- number -->
    <input
      v-else-if="field.type === 'number'"
      v-model.number="value"
      type="number"
      class="input mono"
      :min="field.min"
      :max="field.max"
      :step="field.step ?? 1"
    />

    <!-- free text / page range -->
    <input
      v-else-if="field.type === 'text'"
      v-model="value"
      class="input"
      :class="{ mono: field.mono }"
      :placeholder="field.placeholder ? t(field.placeholder) : ''"
      spellcheck="false"
    />

    <!-- password -->
    <input
      v-else-if="field.type === 'password'"
      v-model="value"
      type="password"
      class="input"
      :placeholder="field.placeholder ? t(field.placeholder) : ''"
    />

    <!-- output directory -->
    <div v-else-if="field.type === 'dir'" class="dir">
      <span class="dir-path mono truncate" :title="value">{{ value || "—" }}</span>
      <button class="btn btn-sm btn-quiet" @click="browse">{{ t("bench.change") }}</button>
    </div>

    <!-- boolean -->
    <button
      v-else-if="field.type === 'switch'"
      type="button"
      class="switch"
      :class="{ on: value }"
      @click="value = !value"
    >
      <span class="knob" />
      <span class="switch-text">{{ value ? t("common.on") : t("common.off") }}</span>
    </button>

    <!-- multi-pick numeric set (icon sizes) -->
    <div v-else-if="field.type === 'sizes'" class="chips">
      <button
        v-for="o in field.choices ?? []"
        :key="o"
        type="button"
        class="chip"
        :class="{ on: (value as number[]).includes(o) }"
        @click="value = toggleIn(value as number[], o)"
      >
        {{ o }}
      </button>
    </div>

    <p v-if="field.hint" class="hint">{{ t(field.hint) }}</p>
  </div>
</template>

<style scoped>
.dir {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 4px 0 9px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-2);
}

.dir-path {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--ink-2);
  direction: rtl;
  text-align: left;
}

.switch {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 30px;
  padding: 0 11px 0 4px;
  border: 0;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--ink-2);
  font-family: var(--f-ui);
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  align-self: flex-start;
  transition: color 0.16s var(--ease);
}

.switch:hover {
  background: var(--s-2);
}

.switch .knob {
  width: 34px;
  height: 20px;
  border-radius: var(--r-pill);
  background: var(--line);
  position: relative;
  flex-shrink: 0;
  transition: background 0.18s var(--ease);
}

.switch .knob::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(27, 45, 98, 0.25);
  transition: transform 0.18s var(--ease-out);
}

.switch.on {
  color: var(--acc);
}

.switch.on .knob {
  background: var(--acc);
}

.switch.on .knob::after {
  transform: translateX(14px);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
</style>
