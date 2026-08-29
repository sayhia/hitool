<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { errText } from "../../lib/err";
import { LANGS, convert, type Lang } from "../../lib/jsonToCode";
import { EXTENSIONS, highlight } from "../../lib/highlight";
import { copyText, toast } from "../../stores/toast";
import { inWails, outputDir, writeFileChunked } from "../../lib/backend";

const SAMPLE = `{
  "id": 1024,
  "name": "HiTool",
  "price": 39.9,
  "published": true,
  "tags": ["desktop", "toolbox"],
  "author": { "name": "Ada", "email": "ada@example.com" },
  "releases": [
    { "version": "0.1.0", "date": "2026-08-01", "stable": false },
    { "version": "0.3.0", "date": "2026-08-02", "stable": true, "notes": "dev tools" }
  ],
  "deprecated": null
}`;

const input = ref("");
const lang = ref<Lang>("go");
const rootName = ref("Root");
const pkg = ref("");
const exporting = ref(false);

const needsPkg = computed(() => LANGS.find((l) => l.id === lang.value)?.needsPkg ?? false);

const result = computed<{ code: string; error: string }>(() => {
  if (!input.value.trim()) return { code: "", error: "" };
  try {
    return { code: convert(input.value, lang.value, rootName.value, pkg.value), error: "" };
  } catch (e) {
    return { code: "", error: (e as Error).message };
  }
});

const tokens = computed(() => (result.value.code ? highlight(result.value.code, lang.value) : []));

// C# and Java disagree on what a "package" is called, but both need one.
watch(lang, (l) => {
  if (l === "csharp" && (!pkg.value || pkg.value.includes("."))) pkg.value = "Generated";
  if (l === "java" && (!pkg.value || pkg.value === "Generated")) pkg.value = "com.example.model";
});

async function exportFile() {
  if (!result.value.code || exporting.value) return;
  if (!inWails()) {
    toast(t("json.exportDesktopOnly"), "fail");
    return;
  }
  exporting.value = true;
  try {
    const dir = await outputDir("Code");
    const name = `${rootName.value || "Root"}${EXTENSIONS[lang.value]}`;
    const path = `${dir}/${name}`;
    await writeFileChunked(path, new TextEncoder().encode(result.value.code));
    toast(t("json.exported", { path: name }), "ok");
  } catch (e) {
    toast(errText(e), "fail");
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <ToolFrame tool-id="json-to-code" shape="flow">
    <div class="row">
      <button class="chip" @click="input = SAMPLE">{{ t("json.sample") }}</button>
      <button class="chip" :disabled="!input" @click="input = ''">{{ t("common.clear") }}</button>
    </div>

    <div class="field grow-field">
      <span class="lab">{{ t("json.input") }}</span>
      <textarea
        v-model="input"
        class="textarea mono src"
        :class="{ bad: !!result.error }"
        :placeholder="t('json.inputPh')"
        spellcheck="false"
      ></textarea>
      <p v-if="result.error" class="err mono">{{ result.error }}</p>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("json.output") }}</span>
        <span class="badge acc">{{ LANGS.find((l) => l.id === lang)?.label }}</span>
        <button
          class="btn btn-sm btn-quiet"
          :disabled="!result.code"
          @click="copyText(result.code, t('common.copied'))"
        >
          <Icon name="Copy" /> {{ t("common.copy") }}
        </button>
        <button class="btn btn-sm btn-quiet" :disabled="!result.code || exporting" @click="exportFile">
          <Icon name="Download" /> {{ t("json.export") }}
        </button>
      </div>
      <div class="code mono scroll-y">
        <template v-if="tokens.length">
          <span v-for="(tk, i) in tokens" :key="i" :class="tk.cls">{{ tk.text }}</span>
        </template>
        <span v-else class="hint">{{ t("json.empty") }}</span>
      </div>
    </template>

    <template #inspector>
      <InspectorSection :title="t('json.language')" icon="Code2">
        <div class="langlist">
          <button
            v-for="l in LANGS"
            :key="l.id"
            class="langrow"
            :class="{ on: lang === l.id }"
            @click="lang = l.id"
          >
            {{ l.label }}
            <code class="mono ext">{{ EXTENSIONS[l.id] }}</code>
          </button>
        </div>
      </InspectorSection>

      <InspectorSection :title="t('json.naming')" icon="Tag">
        <label class="field">
          <span class="lab">{{ t("json.rootName") }}</span>
          <input v-model="rootName" class="input mono" spellcheck="false" />
        </label>
        <label v-if="needsPkg" class="field">
          <span class="lab">{{ t("json.packageName") }}</span>
          <input v-model="pkg" class="input mono" spellcheck="false" />
        </label>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
.row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.grow-field {
  flex: 1;
  min-height: 0;
}

.src {
  flex: 1;
  min-height: 300px;
}

.err {
  font-size: var(--t-xs);
  color: var(--fail);
  word-break: break-word;
}

.textarea.bad {
  border-color: var(--fail);
}

.res-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.res-head .btn:first-of-type {
  margin-left: auto;
}

.code {
  flex: 1;
  padding: 12px 14px;
  font-size: var(--t-sm);
  line-height: 1.7;
  white-space: pre;
  overflow: auto;
  user-select: text;
  tab-size: 4;
}

.code .kw { color: var(--syn-kw); font-weight: 600; }
.code .type { color: var(--syn-str); }
.code .str { color: var(--syn-str); }
.code .num { color: var(--syn-num); }
.code .com { color: var(--syn-com); font-style: italic; }
.code .attr { color: var(--syn-punc); }

.langlist {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.langrow {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  font-family: var(--f-ui);
  font-size: var(--t-sm);
  font-weight: 550;
  cursor: pointer;
  text-align: left;
}

.langrow:hover:not(.on) {
  background: var(--s-3);
  color: var(--ink);
}

.langrow.on {
  background: var(--acc-wash);
  border-color: var(--acc-line);
  color: var(--acc);
}

.ext {
  margin-left: auto;
  font-size: var(--t-xs);
  color: var(--ink-3);
}

.langrow.on .ext {
  color: var(--acc);
}
</style>
