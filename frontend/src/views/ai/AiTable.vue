<script setup lang="ts">
import { computed, ref } from "vue";
import AiToolBase from "../../components/AiToolBase.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import { t } from "../../lib/i18n";
import { tableMessages } from "../../lib/aiTasks";

const instruction = ref("");
const placeholder = computed(() => t("ai.table.placeholder"));
function buildMessages(input: string) {
  return tableMessages(input, instruction.value);
}
</script>

<template>
  <AiToolBase tool-id="ai-table" :placeholder="placeholder" :build-messages="buildMessages">
    <template #controls>
      <InspectorSection :title="t('ai.table.instruction')" icon="Table">
        <textarea v-model="instruction" class="textarea instr" :placeholder="t('ai.table.instructionPh')" spellcheck="false" />
        <p class="hint">{{ t("ai.table.instructionHint") }}</p>
      </InspectorSection>
    </template>
  </AiToolBase>
</template>

<style scoped>
.instr { min-height: 92px; font-size: var(--t-sm); }
</style>
