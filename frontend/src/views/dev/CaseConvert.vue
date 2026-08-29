<script setup lang="ts">
/**
 * Naming-style conversion: paste any identifier and read it back in every
 * common casing at once, so the right one is a click away regardless of what
 * the source style was.
 */
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { convertAll, splitWords } from "../../lib/caseConvert";

const input = ref("");

const words = computed(() => splitWords(input.value));
const rows = computed(() => convertAll(input.value));
</script>

<template>
  <ToolFrame tool-id="case-convert" shape="flow">
    <div class="field grow-field">
      <span class="lab">{{ t("caseconv.input") }}</span>
      <textarea
        v-model="input"
        class="textarea mono doc"
        :placeholder="t('caseconv.inputPh')"
        spellcheck="false"
      ></textarea>
      <p v-if="words.length" class="hint words">
        <span class="lab">{{ t("caseconv.words") }}</span>
        <span v-for="(w, i) in words" :key="i" class="tag mono">{{ w }}</span>
      </p>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("caseconv.styles") }}</span>
        <span v-if="rows.length" class="badge">{{ rows.length }}</span>
      </div>
      <div class="out scroll-y">
        <template v-if="rows.length">
          <div v-for="r in rows" :key="r.style.id" class="row">
            <span class="lab style">{{ r.style.label }}</span>
            <span class="mono text truncate" :title="r.text">{{ r.text }}</span>
            <button class="btn btn-icon" :title="t('common.copy')" @click="copyText(r.text, t('common.copied'))">
              <Icon name="Copy" />
            </button>
          </div>
        </template>
        <p v-else class="hint pad">{{ t("caseconv.empty") }}</p>
      </div>
    </template>
  </ToolFrame>
</template>

<style scoped>
.doc {
  flex: 1;
  min-height: 140px;
}

.words {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  padding: 1px 7px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  background: var(--s-2);
  font-size: var(--t-xs);
  color: var(--ink-2);
}

.res-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.out {
  flex: 1;
  padding: 8px 14px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-bottom: 1px solid var(--line-2);
}

.row:last-child {
  border-bottom: 0;
}

.style {
  width: 118px;
  flex-shrink: 0;
  text-transform: none;
}

.text {
  flex: 1;
  min-width: 0;
  font-size: var(--t-sm);
}

.pad {
  padding: 8px 0;
}
</style>
