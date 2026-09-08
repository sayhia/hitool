<script setup lang="ts">
import { computed, ref } from "vue";
import AiChatBench from "../../components/AiChatBench.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import { t } from "../../lib/i18n";
import { summarizeMessages } from "../../lib/aiTasks";

const sumFormat = ref<"bullets" | "paragraph" | "outline">("bullets");
const depth = ref<"short" | "standard" | "deep">("standard");
const placeholder = computed(() => t("ai.summarize.placeholder"));
function buildMessages(input: string) {
  return summarizeMessages(input, sumFormat.value, depth.value);
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
</script>

<template>
  <AiChatBench tool-id="ai-summarize" :placeholder="placeholder" :build-messages="buildMessages">
    <template #controls>
      <InspectorSection :title="t('ai.summarize.format')" icon="ListTree">
        <div class="optlist">
          <button
            v-for="f in (['bullets', 'paragraph', 'outline'] as const)"
            :key="f"
            class="opt"
            :class="{ on: sumFormat === f }"
            @click="sumFormat = f"
          >
            {{ t(`ai.summarize.format${cap(f)}`) }}
          </button>
        </div>
      </InspectorSection>
      <InspectorSection :title="t('ai.summarize.depth')" icon="AlignLeft">
        <div class="optlist">
          <button
            v-for="d in (['short', 'standard', 'deep'] as const)"
            :key="d"
            class="opt"
            :class="{ on: depth === d }"
            @click="depth = d"
          >
            {{ t(`ai.summarize.depth${cap(d)}`) }}
          </button>
        </div>
      </InspectorSection>
    </template>
  </AiChatBench>
</template>

