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

