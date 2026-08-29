<script setup lang="ts">
import { computed, ref } from "vue";
import AiToolBase from "../../components/AiToolBase.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import { t } from "../../lib/i18n";
import { TARGETS, translateMessages } from "../../lib/aiTasks";

const target = ref("en");
const placeholder = computed(() => t("ai.translate.placeholder"));
function buildMessages(input: string) {
  return translateMessages(input, target.value);
}
</script>

<template>
  <AiToolBase tool-id="ai-translate" :placeholder="placeholder" :build-messages="buildMessages">
    <template #controls>
      <InspectorSection :title="t('ai.translate.target')" icon="Languages">
        <div class="optlist">
          <button
            v-for="x in TARGETS"
            :key="x.id"
            class="opt"
            :class="{ on: target === x.id }"
            @click="target = x.id"
          >
            {{ x.label }}
          </button>
        </div>
      </InspectorSection>
    </template>
  </AiToolBase>
</template>

<style scoped>
.optlist { display: flex; flex-direction: column; gap: 3px; }
.opt {
  display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 11px;
  border: 1px solid transparent; border-radius: var(--r-sm); background: transparent;
  color: var(--ink-2); font-family: var(--f-ui); font-size: var(--t-sm); font-weight: 550;
  cursor: pointer; text-align: left;
}
.opt:hover:not(.on) { background: var(--s-3); color: var(--ink); }
.opt.on { background: var(--acc-wash); border-color: var(--acc-line); color: var(--acc); }
</style>
