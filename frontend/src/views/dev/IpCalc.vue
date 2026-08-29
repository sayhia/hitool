<script setup lang="ts">
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { parseCIDR } from "../../lib/ipv4";

const input = ref("192.168.1.10/24");
const info = computed(() => parseCIDR(input.value));

const rows = computed(() => {
  const c = info.value;
  if (!c) return [];
  return [
    ["ip", c.ip],
    ["prefix", String(c.prefix)],
    ["mask", c.mask],
    ["wildcard", c.wildcard],
    ["network", c.network],
    ["broadcast", c.broadcast],
    ["first", c.first],
    ["last", c.last],
    ["hosts", String(c.hosts)],
  ] as const;
});
</script>

<template>
  <ToolFrame tool-id="ip-calc" shape="single">
    <div class="field">
      <span class="lab">{{ t("ipcalc.input") }}</span>
      <input v-model="input" class="input mono" :placeholder="t('ipcalc.inputPh')" spellcheck="false" />
    </div>
    <p v-if="!info" class="hint">{{ t("ipcalc.invalid") }}</p>
    <div v-else class="table">
      <button
        v-for="[k, v] in rows"
        :key="k"
        type="button"
        class="row"
        @click="copyText(v, t('common.copied'))"
      >
        <span class="lab">{{ t(`ipcalc.${k}`) }}</span>
        <span class="mono val">{{ v }}</span>
      </button>
    </div>
  </ToolFrame>
</template>

<style scoped>
.table {
  display: flex; flex-direction: column; gap: 1px;
  background: var(--line-2); border-radius: var(--r); overflow: hidden;
}
.row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border: 0; background: var(--s-1);
  font-family: var(--f-ui); text-align: left; cursor: pointer;
}
.row:hover { background: var(--s-2); }
.val { margin-left: auto; font-weight: 600; }
</style>
