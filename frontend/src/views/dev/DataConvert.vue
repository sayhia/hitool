<script setup lang="ts">
/**
 * JSON ⇄ YAML ⇄ TOML conversion. The source format is detected so the user
 * only picks where they want to go; errors quote the parser's own message.
 * The result can be fed back as the source, so multi-hop chains
 * (JSON → YAML → TOML) need no copy-paste.
 */
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText, toast } from "../../stores/toast";
import { errText } from "../../lib/err";
import { pickFiles, readFileBytes, formatBytes } from "../../lib/backend";
import { onFilesDropped, dragActive, useFileHandoff } from "../../lib/drop";
import { decodeText, MAX_TEXT_BYTES } from "../../lib/textfile";
import { DATA_FORMATS, detectFormat, parseAs, stringifyAs, type DataFormat } from "../../lib/dataConvert";
import type { FileInfo } from "@bindings/hitool/services/models";

const src = ref("");
const target = ref<DataFormat>("yaml");

async function load(f: FileInfo) {
  if (f.size > MAX_TEXT_BYTES) {
    toast(t("diff.tooBig", { name: f.name, max: formatBytes(MAX_TEXT_BYTES) }), "fail");
    return;
  }
  try {
    const d = decodeText(await readFileBytes(f.path));
    if (d.binary) {
      toast(t("diff.notText", { name: f.name }), "fail");
      return;
    }
    src.value = d.text;
  } catch (e) {
    toast(errText(e), "fail");
  }
}

onFilesDropped((files) => load(files[0]));
useFileHandoff((files) => load(files[0]));

async function choose() {
  const paths = await pickFiles(t("common.selectFiles"), "Data", ["json", "yaml", "yml", "toml"], false);
  if (!paths.length) return;
  const { StatFiles } = await import("@bindings/hitool/services/systemservice");
  const stat = (await StatFiles(paths)) ?? [];
  if (stat.length) load(stat[0]);
}

const detected = computed(() => (src.value.trim() ? detectFormat(src.value) : null));

const result = computed<{ text: string; error: string }>(() => {
  if (!src.value.trim()) return { text: "", error: "" };
  const from = detected.value;
  if (!from) return { text: "", error: t("dataconv.unparsed") };
  try {
    const value = parseAs(src.value, from);
    return { text: stringifyAs(value, target.value), error: "" };
  } catch (e) {
    return { text: "", error: (e as Error).message };
  }
});

/** Feed the conversion result back as the source — chains formats without copy-paste. */
function useAsInput() {
  if (!result.value.text) return;
  src.value = result.value.text;
}

function clear() {
  src.value = "";
}

const outSize = computed(() =>
  result.value.text ? formatBytes(new TextEncoder().encode(result.value.text).length) : "",
);
</script>

<template>
  <ToolFrame tool-id="data-convert" shape="flow">
    <div class="field grow-field" :class="{ hot: dragActive }" data-file-drop-target="dataconv">
      <div class="head">
        <span class="lab">{{ t("dataconv.source") }}</span>
        <span v-if="detected" class="badge acc">{{ detected.toUpperCase() }}</span>
        <div class="head-actions">
          <button class="mini" :title="t('dataconv.useAsInput')" :disabled="!result.text" @click="useAsInput">
            <Icon name="ArrowLeftRight" />
          </button>
          <button class="mini" :title="t('common.clear')" :disabled="!src" @click="clear">
            <Icon name="X" />
          </button>
          <button class="mini" :title="t('diff.openFile')" @click="choose">
            <Icon name="FolderOpen" />
          </button>
        </div>
      </div>
      <textarea
        v-model="src"
        class="textarea mono doc"
        :placeholder="t('dataconv.sourcePh')"
        spellcheck="false"
      ></textarea>
      <div class="target-row">
        <span class="lab">{{ t("dataconv.target") }}</span>
        <div class="seg">
          <button
            v-for="f in DATA_FORMATS"
            :key="f"
            :class="{ on: target === f }"
            @click="target = f"
          >
            {{ f.toUpperCase() }}
          </button>
        </div>
      </div>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("dataconv.result") }}</span>
        <span v-if="outSize" class="badge mono">{{ outSize }}</span>
        <button class="btn btn-sm btn-quiet" :disabled="!result.text" @click="copyText(result.text, t('common.copied'))">
          <Icon name="Copy" />
        </button>
      </div>
      <div v-if="result.error" class="banner fail err">
        <Icon name="CircleAlert" />
        <code class="mono">{{ result.error }}</code>
      </div>
      <pre v-else class="out scroll-y mono">{{ result.text || t("dataconv.idle") }}</pre>
    </template>
  </ToolFrame>
</template>

<style scoped>
.grow-field {
  border-radius: var(--r);
  transition: box-shadow 0.14s;
}

.grow-field.hot {
  box-shadow: 0 0 0 2px var(--cat-primary);
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.head-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
}

.doc {
  flex: 1;
  min-height: 150px;
}

.target-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.target-row .seg {
  flex: 0 1 auto;
  min-width: 0;
}

.res-head {
  padding: 11px 14px;
}

.res-head .btn {
  margin-left: auto;
}

.out {
  flex: 1;
  margin: 0;
  padding: 10px 14px;
  font-size: var(--t-sm);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}

.err {
  margin: 0 14px;
  user-select: text;
}

.err code {
  font-size: var(--t-sm);
  word-break: break-word;
  white-space: pre-wrap;
}
</style>
