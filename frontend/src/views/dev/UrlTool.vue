<script setup lang="ts">
/**
 * URL encode/decode plus a query-string table. The table is editable, so a
 * long URL can be picked apart, a value changed, and the whole thing rebuilt.
 */
import { computed, ref, watch } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { buildQuery, parseQuery, safeDecode, type QueryParam } from "../../lib/codec";

const SAMPLE = "https://example.com/search?q=中文 查询&page=2&tags=a,b#results";

const mode = ref<"query" | "text">("query");
const url = ref("");
const text = ref("");
const component = ref(true);

// ---- query mode ----
const parsed = computed(() => parseQuery(url.value));
const params = ref<QueryParam[]>([]);
const base = ref("");
const hash = ref("");

// Re-derive the editable table whenever the URL box changes.
watch(
  parsed,
  (p) => {
    params.value = p.params.map((x) => ({ ...x }));
    base.value = p.base;
    hash.value = p.hash;
  },
  { immediate: true },
);

const rebuilt = computed(() => buildQuery(base.value, params.value, hash.value));

function addParam() {
  params.value = [...params.value, { key: "", value: "" }];
}

function removeParam(i: number) {
  params.value = params.value.filter((_, idx) => idx !== i);
}

// ---- text mode ----
const encoded = computed(() => {
  if (!text.value) return "";
  try {
    return component.value ? encodeURIComponent(text.value) : encodeURI(text.value);
  } catch (e) {
    return (e as Error).message;
  }
});

const decoded = computed(() => (text.value ? safeDecode(text.value) : ""));
</script>

<template>
  <ToolFrame tool-id="url-tool" shape="flow">
    <div class="seg modeseg">
      <button :class="{ on: mode === 'query' }" @click="mode = 'query'">{{ t("url.modeQuery") }}</button>
      <button :class="{ on: mode === 'text' }" @click="mode = 'text'">{{ t("url.modeText") }}</button>
    </div>

    <template v-if="mode === 'query'">
      <div class="field">
        <div class="head">
          <span class="lab">{{ t("url.input") }}</span>
          <button class="chip" @click="url = SAMPLE">{{ t("json.sample") }}</button>
          <button class="chip" :disabled="!url" @click="url = ''">{{ t("common.clear") }}</button>
        </div>
        <textarea
          v-model="url"
          class="textarea mono urlin"
          :placeholder="t('url.inputPh')"
          spellcheck="false"
        ></textarea>
      </div>

      <div v-if="params.length || base" class="field">
        <div class="head">
          <span class="lab">{{ t("url.params") }}</span>
          <span class="badge">{{ params.length }}</span>
          <button class="btn btn-sm btn-quiet" @click="addParam">
            <Icon name="Plus" /> {{ t("url.addParam") }}
          </button>
        </div>
        <div class="ptable">
          <div v-for="(p, i) in params" :key="i" class="prow">
            <input v-model="p.key" class="input mono pkey" :placeholder="t('url.key')" />
            <input v-model="p.value" class="input mono pval" :placeholder="t('url.value')" />
            <button class="btn btn-sm btn-quiet btn-icon" @click="removeParam(i)">
              <Icon name="X" />
            </button>
          </div>
          <p v-if="!params.length" class="hint">{{ t("url.noParams") }}</p>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="field grow-field">
        <div class="head">
          <span class="lab">{{ t("url.text") }}</span>
          <span v-if="text" class="badge">{{ text.length }}</span>
        </div>
        <textarea
          v-model="text"
          class="textarea mono src"
          :placeholder="t('url.textPh')"
          spellcheck="false"
        ></textarea>
      </div>
    </template>

    <template #result>
      <template v-if="mode === 'query'">
        <div class="res-head">
          <span class="lab">{{ t("url.rebuilt") }}</span>
          <button
            class="btn btn-sm btn-quiet"
            :disabled="!rebuilt"
            @click="copyText(rebuilt, t('common.copied'))"
          >
            <Icon name="Copy" /> {{ t("common.copy") }}
          </button>
        </div>
        <div class="out mono scroll-y">
          <template v-if="rebuilt">{{ rebuilt }}</template>
          <span v-else class="hint">{{ t("url.idle") }}</span>
        </div>
      </template>

      <template v-else>
        <div class="res-head">
          <span class="lab">{{ t("url.result") }}</span>
        </div>
        <div class="res-body scroll-y">
          <div class="block">
            <div class="block-head">
              <span class="lab">{{ t("url.encoded") }}</span>
              <button
                class="btn btn-sm btn-quiet"
                :disabled="!encoded"
                @click="copyText(encoded, t('common.copied'))"
              >
                <Icon name="Copy" />
              </button>
            </div>
            <code class="out-box mono">{{ encoded || "—" }}</code>
          </div>
          <div class="block">
            <div class="block-head">
              <span class="lab">{{ t("url.decoded") }}</span>
              <button
                class="btn btn-sm btn-quiet"
                :disabled="!decoded"
                @click="copyText(decoded, t('common.copied'))"
              >
                <Icon name="Copy" />
              </button>
            </div>
            <code class="out-box mono">{{ decoded || "—" }}</code>
          </div>
        </div>
      </template>
    </template>

    <template #inspector>
      <InspectorSection v-if="mode === 'query'" :title="t('url.parts')" icon="Link">
        <label class="field">
          <span class="lab">{{ t("url.base") }}</span>
          <input v-model="base" class="input mono" spellcheck="false" />
        </label>
        <label class="field">
          <span class="lab">{{ t("url.hash") }}</span>
          <input v-model="hash" class="input mono" spellcheck="false" />
        </label>
      </InspectorSection>

      <InspectorSection v-else :title="t('b64.options')" icon="Settings2">
        <div class="optlist">
          <button class="opt" :class="{ on: component }" @click="component = true">
            encodeURIComponent
          </button>
          <button class="opt" :class="{ on: !component }" @click="component = false">
            encodeURI
          </button>
        </div>
        <p class="hint">{{ component ? t("url.componentHint") : t("url.uriHint") }}</p>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
.modeseg {
  width: 220px;
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.head .btn,
.head .chip:first-of-type {
  margin-left: auto;
}

.head .chip + .chip {
  margin-left: 0;
}

.urlin {
  min-height: 88px;
  font-size: var(--t-sm);
}

.grow-field {
  flex: 1;
  min-height: 0;
}

.src {
  flex: 1;
  min-height: 200px;
}

/* Param table: key and value share the row, remove sits at the end. */
.ptable {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.prow {
  display: flex;
  gap: 6px;
  align-items: center;
}

.pkey {
  flex: 0 0 30%;
}

.pval {
  flex: 1;
  min-width: 0;
}

.res-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.res-head .btn {
  margin-left: auto;
}

.out {
  flex: 1;
  padding: 13px 14px;
  font-size: var(--t-sm);
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
}

.res-body {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.block-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.block-head .btn {
  margin-left: auto;
}

.out-box {
  padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-1);
  font-size: var(--t-sm);
  line-height: 1.7;
  word-break: break-all;
  user-select: text;
}

.optlist {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.opt {
  height: 32px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  font-family: var(--f-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.opt:hover:not(.on) {
  background: var(--s-3);
  color: var(--ink);
}

.opt.on {
  background: var(--acc-wash);
  border-color: var(--acc-line);
  color: var(--acc);
}
</style>
