<script setup lang="ts">
import { computed, ref } from "vue";
import AiChatBench from "../../components/AiChatBench.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import { t } from "../../lib/i18n";
import { explainMessages } from "../../lib/aiTasks";

const focus = ref<"overview" | "step" | "issues">("overview");
const placeholder = computed(() => t("ai.explain.placeholder"));
function buildMessages(input: string) {
  return explainMessages(input, focus.value);
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
</script>

<template>
  <AiChatBench tool-id="ai-explain" :placeholder="placeholder" :build-messages="buildMessages">
    <template #controls>
      <InspectorSection :title="t('ai.explain.focus')" icon="ScanLine">
        <div class="optlist">
          <button
            v-for="f in (['overview', 'step', 'issues'] as const)"
            :key="f"
            class="opt"
            :class="{ on: focus === f }"
            @click="focus = f"
          >
            {{ t(`ai.explain.focus${cap(f)}`) }}
          </button>
        </div>
      </InspectorSection>
    </template>
  </AiChatBench>
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
