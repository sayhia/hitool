<script setup lang="ts">
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { decodeHtml, encodeHtml } from "../../lib/htmlEntities";

const src = ref("");
const numeric = ref(false);
const encoded = computed(() => (src.value ? encodeHtml(src.value, numeric.value) : ""));
const decoded = computed(() => (src.value ? decodeHtml(src.value) : ""));
</script>

<template>
  <ToolFrame tool-id="html-entities" shape="flow">
    <div class="field grow-field">
      <div class="head">
        <span class="lab">{{ t("htmlent.input") }}</span>
        <label class="chk">
          <input v-model="numeric" type="checkbox" />
          {{ t("htmlent.numeric") }}
        </label>
        <button class="chip" :disabled="!src" @click="src = ''">{{ t("common.clear") }}</button>
      </div>
      <textarea
        v-model="src"
        class="textarea mono grow"
        :placeholder="t('htmlent.inputPh')"
        spellcheck="false"
      />
    </div>
    <template #result>
      <div class="col">
        <div class="block">
          <div class="head">
            <span class="lab">{{ t("htmlent.encoded") }}</span>
            <button class="btn btn-icon" :disabled="!encoded" @click="copyText(encoded, t('common.copied'))">
              <Icon name="Copy" />
            </button>
          </div>
          <pre class="out mono">{{ encoded || t("htmlent.idle") }}</pre>
        </div>
        <div class="block">
          <div class="head">
            <span class="lab">{{ t("htmlent.decoded") }}</span>
            <button class="btn btn-icon" :disabled="!decoded" @click="copyText(decoded, t('common.copied'))">
              <Icon name="Copy" />
            </button>
          </div>
          <pre class="out mono">{{ decoded || t("htmlent.idle") }}</pre>
        </div>
      </div>
    </template>
  </ToolFrame>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 8px; }
.head .lab { flex: 1; }
.chk { display: flex; align-items: center; gap: 6px; font-size: var(--t-sm); color: var(--ink-2); }
.grow-field { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
.grow { flex: 1; min-height: 160px; }
.col { display: flex; flex-direction: column; gap: 12px; height: 100%; padding: 14px; }
.block { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
.out {
  flex: 1; margin: 0; padding: 12px; border-radius: var(--r-sm);
  background: var(--s-2); white-space: pre-wrap; word-break: break-all; overflow: auto;
  color: var(--ink-2); font-size: var(--t-sm);
}
</style>
