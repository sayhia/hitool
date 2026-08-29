<script setup lang="ts">
/**
 * Paste a curl command, get the request it describes. Handy when a doc hands
 * you curl and the API client of choice wants fields instead.
 */
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { parseCurl } from "../../lib/curlParse";

const src = ref("");

const req = computed(() => (src.value.trim() ? parseCurl(src.value) : null));
</script>

<template>
  <ToolFrame tool-id="curl-parse" shape="flow">
    <div class="field grow-field">
      <span class="lab">{{ t("curlp.source") }}</span>
      <textarea
        v-model="src"
        class="textarea mono doc"
        :placeholder="t('curlp.sourcePh')"
        spellcheck="false"
      ></textarea>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("curlp.result") }}</span>
      </div>
      <div v-if="req && req.url" class="out scroll-y">
        <div class="row">
          <span class="lab k">{{ t("curlp.method") }}</span>
          <span class="badge acc mono">{{ req.method }}</span>
        </div>
        <div class="row">
          <span class="lab k">URL</span>
          <span class="mono v">{{ req.url }}</span>
        </div>
        <template v-if="req.headers.length">
          <div class="row" v-for="h in req.headers" :key="h.name">
            <span class="lab k">{{ h.name }}</span>
            <span class="mono v">{{ h.value }}</span>
          </div>
        </template>
        <div v-if="req.user" class="row">
          <span class="lab k">{{ t("curlp.user") }}</span>
          <span class="mono v">{{ req.user }}</span>
        </div>
        <div v-if="req.body" class="row body-row">
          <span class="lab k">{{ t("curlp.body") }}</span>
          <div class="body-wrap">
            <pre class="mono v body">{{ req.body }}</pre>
            <button class="btn btn-icon" :title="t('common.copy')" @click="copyText(req.body, t('common.copied'))">
              <Icon name="Copy" />
            </button>
          </div>
        </div>
        <div v-if="req.other.length" class="row">
          <span class="lab k">{{ t("curlp.other") }}</span>
          <span class="mono v">{{ req.other.join(" ") }}</span>
        </div>
      </div>
      <div v-else class="out"><p class="hint pad">{{ t("curlp.idle") }}</p></div>
    </template>
  </ToolFrame>
</template>

<style scoped>
.doc {
  flex: 1;
  min-height: 150px;
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
  align-items: baseline;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line-2);
}

.row:last-child {
  border-bottom: 0;
}

.k {
  width: 130px;
  flex-shrink: 0;
}

.v {
  flex: 1;
  min-width: 0;
  font-size: var(--t-sm);
  word-break: break-all;
  user-select: text;
}

.body-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.body {
  flex: 1;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: var(--t-sm);
}

.pad {
  padding: 8px 0;
}
</style>
