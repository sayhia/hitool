<script setup lang="ts">
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { parseCIDR } from "../../lib/ipv4";

const input = ref("192.168.1.10/24");
const info = computed(() => parseCIDR(input.value));

const summary = computed(() => {
  const c = info.value;
  if (!c) return [];
  return [
    ["network", c.network],
    ["broadcast", c.broadcast],
    ["mask", c.mask],
    ["hosts", String(c.hosts)],
  ] as const;
});

const rows = computed(() => {
  const c = info.value;
  if (!c) return [];
  return [
    ["ip", c.ip],
    ["prefix", String(c.prefix)],
    ["wildcard", c.wildcard],
    ["first", c.first],
    ["last", c.last],
  ] as const;
});

const allText = computed(() => {
  const c = info.value;
  if (!c) return "";
  return [
    `IP: ${c.ip}/${c.prefix}`,
    `Network: ${c.network}`,
    `Broadcast: ${c.broadcast}`,
    `Mask: ${c.mask}`,
    `Range: ${c.first} - ${c.last}`,
    `Hosts: ${c.hosts}`,
    `Class: ${c.class}`,
  ].join("\n");
});

function copyAll() {
  copyText(allText.value, t("common.copied"));
}
</script>

<template>
  <ToolFrame tool-id="ip-calc" shape="single">
    <div class="field">
      <span class="lab">{{ t("ipcalc.input") }}</span>
      <input v-model="input" class="input mono" :placeholder="t('ipcalc.inputPh')" spellcheck="false" />
    </div>

    <div v-if="!info" class="banner fail">
      <Icon name="CircleAlert" />
      <span>{{ t("ipcalc.invalid") }}</span>
    </div>

    <template v-else>
      <div class="badges">
        <span class="badge cat">{{ t("ipcalc.classLabel") }} {{ info.class }}</span>
        <span class="badge" :class="info.private ? 'acc' : 'muted'">
          {{ info.private ? t("ipcalc.private") : t("ipcalc.public") }}
        </span>
        <button class="btn btn-sm btn-quiet copy-all" @click="copyAll">
          <Icon name="Copy" :size="13" />
          {{ t("ipcalc.copyAll") }}
        </button>
      </div>

      <div class="readout">
        <button
          v-for="[k, v] in summary"
          :key="k"
          type="button"
          class="cell clickable"
          :title="t('common.copy')"
          @click="copyText(v, t('common.copied'))"
        >
          <span class="lab">{{ t(`ipcalc.${k}`) }}</span>
          <span class="value mono" :class="{ cat: k === 'network' }">{{ v }}</span>
        </button>
      </div>

      <div class="detail">
        <button
          v-for="[k, v] in rows"
          :key="k"
          type="button"
          class="copyrow"
          @click="copyText(v, t('common.copied'))"
        >
          <span class="lab">{{ t(`ipcalc.${k}`) }}</span>
          <span class="mono val">{{ v }}</span>
        </button>
      </div>

      <div class="bin-section">
        <span class="lab">{{ t("ipcalc.binary") }}</span>
        <div class="bin-row">
          <span class="bin-lab">IP</span>
          <code class="mono bin-val">{{ info.ipBin }}</code>
        </div>
        <div class="bin-row">
          <span class="bin-lab">{{ t("ipcalc.mask") }}</span>
          <code class="mono bin-val">{{ info.maskBin }}</code>
        </div>
      </div>
    </template>
  </ToolFrame>
</template>

<style scoped>
.readout .cell.clickable {
  border: 0; cursor: pointer; font-family: var(--f-ui);
  transition: background 0.16s var(--ease);
}
.readout .cell.clickable:hover { background: var(--s-3); }
.value.cat { color: var(--cat); font-weight: 700; }

.badges { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.badge.muted { opacity: 0.6; }
.copy-all { margin-left: auto; display: flex; align-items: center; gap: 4px; }

.detail {
  display: flex; flex-direction: column; gap: 1px;
  background: var(--line-2); border-radius: var(--r); overflow: hidden;
}
.detail .copyrow { border-radius: 0; padding: 9px 13px; background: var(--s-1); }
.detail .copyrow:hover { background: var(--cat-wash); }
.detail .val { font-size: var(--t-md); }

.bin-section {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 0; border-top: 1px solid var(--line-2);
}
.bin-row { display: flex; align-items: center; gap: 10px; }
.bin-lab { width: 50px; font-size: var(--t-sm); color: var(--f-2); flex-shrink: 0; }
.bin-val { font-size: var(--t-xs); letter-spacing: 0.04em; word-break: break-all; user-select: text; }
</style>
