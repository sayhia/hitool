<script setup lang="ts">
/**
 * JSON ⇄ YAML ⇄ TOML conversion. The source format is detected so the user
 * only picks where they want to go; errors quote the parser's own message.
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
</script>

<template>
  <ToolFrame tool-id="data-convert" shape="flow">
    <div class="field grow-field" :class="{ hot: dragActive }" data-file-drop-target="dataconv">
      <div class="head">
        <span class="lab">{{ t("dataconv.source") }}</span>
        <span v-if="detected" class="badge acc">{{ detected.toUpperCase() }}</span>
        <button class="mini" :title="t('diff.openFile')" @click="choose">
          <Icon name="FolderOpen" />
        </button>
      </div>
      <textarea
        v-model="src"
        class="textarea mono doc"
        :placeholder="t('dataconv.sourcePh')"
        spellcheck="false"
      ></textarea>
      <div class="seg">
        <span class="lab">{{ t("dataconv.target") }}</span>
        <button
          v-for="f in DATA_FORMATS"
          :key="f"
          class="chip"
          :class="{ on: target === f }"
          @click="target = f"
        >
          {{ f.toUpperCase() }}
        </button>
      </div>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("dataconv.result") }}</span>
        <button class="btn btn-sm btn-quiet" :disabled="!result.text" @click="copyText(result.text, t('common.copied'))">
          <Icon name="Copy" />
        </button>
      </div>
      <pre v-if="result.error" class="out scroll-y mono err">{{ result.error }}</pre>
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
  box-shadow: 0 0 0 2px var(--acc);
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mini {
  margin-left: auto;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
  flex-shrink: 0;
}

.mini:hover {
  background: var(--s-3);
  color: var(--ink);
}

.mini :deep(svg) {
  width: 13px;
  height: 13px;
}

.doc {
  flex: 1;
  min-height: 150px;
}

.seg {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.res-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
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
  color: var(--fail);
}
</style>
