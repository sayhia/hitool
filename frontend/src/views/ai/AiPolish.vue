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

