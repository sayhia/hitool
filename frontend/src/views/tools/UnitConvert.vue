<script setup lang="ts">
/**
 * Unit conversion across ten families.
 *
 * The result pane shows *every* unit at once rather than one chosen target:
 * the question behind a conversion is usually "how big is that really", and
 * reading the whole column answers it without having to pick a unit first.
 */
import { computed, ref, watch } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { FAMILIES, convertAll, formatValue } from "../../lib/units";

const familyId = ref("length");
const from = ref("m");
const amount = ref("1");

const family = computed(() => FAMILIES.find((f) => f.id === familyId.value)!);

const value = computed(() => {
  const raw = amount.value.replace(/[\s,]/g, "");
  if (!raw) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
});

// Switching family invalidates the source unit, so fall back to its base.
watch(familyId, () => {
  from.value = family.value.base;
});

const rows = computed(() =>
  value.value === null ? [] : convertAll(value.value, from.value, family.value),
);

function copyRow(id: string, v: number) {
  copyText(formatValue(v), t("common.copied"));
}
</script>

<template>
  <ToolFrame tool-id="unit-convert" shape="flow">
    <div class="field">
      <span class="lab">{{ t("unit.family") }}</span>
      <div class="chips">
        <button
          v-for="f in FAMILIES"
          :key="f.id"
          class="chip"
          :class="{ on: familyId === f.id }"
          @click="familyId = f.id"
        >
          {{ t(`unit.f_${f.id}`) }}
        </button>
      </div>
    </div>

    <div class="row">
      <div class="field grow">
        <span class="lab">{{ t("unit.amount") }}</span>
        <input
          v-model="amount"
          class="input mono big"
          :class="{ bad: value === null && amount.trim() !== '' }"
          inputmode="decimal"
          spellcheck="false"
        />
        <p v-if="value === null && amount.trim() !== ''" class="err">{{ t("unit.bad") }}</p>
      </div>

      <div class="field unitpick">
        <span class="lab">{{ t("unit.from") }}</span>
        <select v-model="from" class="input mono">
          <option v-for="u in family.units" :key="u.id" :value="u.id">
            {{ t(`unit.u_${u.id}`) }}
          </option>
        </select>
      </div>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("unit.result") }}</span>
        <span v-if="value !== null" class="badge">{{ t(`unit.f_${familyId}`) }}</span>
      </div>

      <div class="rows scroll-y">
        <template v-if="rows.length">
          <button
            v-for="r in rows"
            :key="r.id"
            class="urow"
            :class="{ self: r.id === from }"
            :title="t('common.copy')"
            @click="copyRow(r.id, r.value)"
          >
            <span class="uval mono">{{ formatValue(r.value) }}</span>
            <span class="uname">{{ t(`unit.u_${r.id}`) }}</span>
            <Icon name="Copy" class="ucopy" />
          </button>
        </template>
        <p v-else class="hint pad">{{ t("unit.idle") }}</p>
      </div>
    </template>

    <template #inspector>
      <InspectorSection :title="t('unit.notes')" icon="Info" :open="true">
        <p class="hint">{{ t("unit.noteExact") }}</p>
        <p v-if="familyId === 'data'" class="hint">{{ t("unit.noteData") }}</p>
        <p v-if="familyId === 'temperature'" class="hint">{{ t("unit.noteTemp") }}</p>
        <p v-if="familyId === 'time'" class="hint">{{ t("unit.noteYear") }}</p>
        <p v-if="familyId === 'volume'" class="hint">{{ t("unit.noteGallon") }}</p>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.grow {
  flex: 1;
  min-width: 160px;
}

.unitpick {
  width: 170px;
}

.big {
  font-size: 17px;
  padding-top: 9px;
  padding-bottom: 9px;
}

.input.bad {
  border-color: var(--fail);
}

.err {
  font-size: var(--t-xs);
  color: var(--fail);
  margin-top: 4px;
}

.res-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.rows {
  flex: 1;
  padding: 6px 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.pad {
  padding: 12px 6px;
}

.urow {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  padding: 7px 9px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.urow:hover {
  background: var(--s-2);
}

/* The unit you typed in, so the column has an anchor to read against. */
.urow.self {
  background: var(--acc-wash);
}

.uval {
  flex: 1;
  min-width: 0;
  font-size: var(--t-md);
  color: var(--ink);
  word-break: break-all;
  user-select: text;
}

.uname {
  font-size: var(--t-xs);
  color: var(--ink-3);
  flex-shrink: 0;
  min-width: 72px;
}

.ucopy {
  width: 12px;
  height: 12px;
  color: var(--ink-4);
  opacity: 0;
  flex-shrink: 0;
}

.urow:hover .ucopy {
  opacity: 1;
}
</style>
