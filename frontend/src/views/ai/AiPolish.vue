<script setup lang="ts">
import { computed, ref } from "vue";
import AiToolBase from "../../components/AiToolBase.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import { t } from "../../lib/i18n";
import { polishMessages } from "../../lib/aiTasks";

const polishStyle = ref<"formal" | "concise" | "vivid">("formal");
const placeholder = computed(() => t("ai.polish.placeholder"));
function buildMessages(input: string) {
  return polishMessages(input, polishStyle.value);
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
</script>

<template>
  <AiToolBase tool-id="ai-polish" :placeholder="placeholder" :build-messages="buildMessages">
    <template #controls>
      <InspectorSection :title="t('ai.polish.style')" icon="Wand2">
        <div class="optlist">
          <button
            v-for="s in (['formal', 'concise', 'vivid'] as const)"
            :key="s"
            class="opt"
            :class="{ on: polishStyle === s }"
            @click="polishStyle = s"
          >
            {{ t(`ai.polish.style${cap(s)}`) }}
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
