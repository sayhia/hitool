<script setup lang="ts">
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { parseCurl, curlToFetch, curlToAxios, curlToJson } from "../../lib/curlParse";

const SAMPLE = `curl -X POST https://api.example.com/v1/items \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer tok_abc123' \\
  -d '{"name": "widget", "qty": 42}'`;

const src = ref("");

const req = computed(() => (src.value.trim() ? parseCurl(src.value) : null));
const fetchCode = computed(() => (req.value ? curlToFetch(req.value) : ""));
const axiosCode = computed(() => (req.value ? curlToAxios(req.value) : ""));
const jsonCode = computed(() => (req.value ? curlToJson(req.value) : ""));

type ExportTab = "fetch" | "axios" | "json";
const tab = ref<ExportTab>("fetch");
const exportCode = computed(() => {
  if (tab.value === "fetch") return fetchCode.value;
  if (tab.value === "axios") return axiosCode.value;
  return jsonCode.value;
});
</script>

<template>
  <ToolFrame tool-id="curl-parse" shape="flow">
    <div class="field grow-field">
      <div class="head">
        <span class="lab">{{ t("curlp.source") }}</span>
        <button class="chip" @click="src = SAMPLE">{{ t("json.sample") }}</button>
      </div>
      <textarea
        v-model="src"
        class="textarea mono doc"
        :placeholder="t('curlp.sourcePh')"
        spellcheck="false"
      ></textarea>
    </div>

    <template #result>
      <div v-if="req && req.url" class="result-wrap">
        <div class="res-head">
          <span class="lab">{{ t("curlp.result") }}</span>
        </div>
        <div class="out scroll-y">
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

        <div class="export-section">
          <div class="tabs">
            <button
              v-for="k in (['fetch', 'axios', 'json'] as const)"
              :key="k"
              class="tab"
              :class="{ active: tab === k }"
              @click="tab = k"
            >{{ t(`curlp.${k}`) }}</button>
          </div>
          <div class="export-body">
            <pre class="mono export-code scroll-y">{{ exportCode }}</pre>
            <button
              class="btn btn-icon export-copy"
              :title="t('common.copy')"
              @click="copyText(exportCode, t('common.copied'))"
            >
              <Icon name="Copy" />
            </button>
          </div>
        </div>
      </div>
      <div v-else class="out"><p class="hint pad">{{ t("curlp.idle") }}</p></div>
    </template>
  </ToolFrame>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 8px; }
.head .lab { flex: 1; }
.doc { flex: 1; min-height: 150px; }

.result-wrap { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.res-head { padding: 11px 14px; }
.out { padding: 8px 14px; }

.row {
  display: flex; align-items: baseline; gap: 10px;
  padding: 6px 0; border-bottom: 1px solid var(--line-2);
}
.row:last-child { border-bottom: 0; }
.k { width: 130px; flex-shrink: 0; }
.v { flex: 1; min-width: 0; font-size: var(--t-sm); word-break: break-all; user-select: text; }

.body-wrap { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 8px; }
.body { flex: 1; margin: 0; white-space: pre-wrap; word-break: break-word; font-size: var(--t-sm); }
.pad { padding: 8px 0; }

.export-section {
  border-top: 1px solid var(--line-2);
  display: flex; flex-direction: column; flex: 1; min-height: 0;
}
.tabs { display: flex; gap: 0; border-bottom: 1px solid var(--line-2); }
.tab {
  padding: 7px 16px; font-size: var(--t-sm); background: none; border: 0;
  border-bottom: 2px solid transparent; cursor: pointer; color: var(--f-2);
  font-family: var(--f-ui); transition: all 0.14s var(--ease);
}
.tab:hover { color: var(--f-1); }
.tab.active { color: var(--acc); border-bottom-color: var(--acc); }

.export-body {
  flex: 1; position: relative; min-height: 0;
}
.export-code {
  margin: 0; padding: 12px 14px; font-size: var(--t-sm);
  line-height: 1.6; white-space: pre-wrap; word-break: break-word; user-select: text;
}
.export-copy { position: absolute; top: 8px; right: 8px; }
</style>
