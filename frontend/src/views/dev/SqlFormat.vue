<script setup lang="ts">
/**
 * SQL pretty-printing: clause-per-line layout with keywords shaped
 * consistently. Pure frontend, so it also works on pasted fragments.
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
import { formatSql } from "../../lib/sqlFormat";
import type { FileInfo } from "@bindings/hitool/services/models";

const src = ref("");
const uppercase = ref(true);

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
  const paths = await pickFiles(t("common.selectFiles"), "SQL", ["sql"], false);
  if (!paths.length) return;
  const { StatFiles } = await import("@bindings/hitool/services/systemservice");
  const stat = (await StatFiles(paths)) ?? [];
  if (stat.length) load(stat[0]);
}

const output = computed(() => {
  if (!src.value.trim()) return "";
  try {
    return formatSql(src.value, { uppercase: uppercase.value });
  } catch {
    return "";
  }
});
</script>

<template>
  <ToolFrame tool-id="sql-format" shape="flow">
    <div class="field grow-field" :class="{ hot: dragActive }" data-file-drop-target="sqlfmt">
      <div class="head">
        <span class="lab">{{ t("sqlfmt.source") }}</span>
        <button class="chip mini-chip" :class="{ on: uppercase }" @click="uppercase = !uppercase">
          {{ t("sqlfmt.upper") }}
        </button>
        <button class="mini" :title="t('diff.openFile')" @click="choose">
          <Icon name="FolderOpen" />
        </button>
      </div>
      <textarea
        v-model="src"
        class="textarea mono doc"
        :placeholder="t('sqlfmt.sourcePh')"
        spellcheck="false"
      ></textarea>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("sqlfmt.result") }}</span>
        <button class="btn btn-sm btn-quiet" :disabled="!output" @click="copyText(output, t('common.copied'))">
          <Icon name="Copy" />
        </button>
      </div>
      <pre class="out scroll-y mono">{{ output || t("sqlfmt.idle") }}</pre>
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

.doc {
  flex: 1;
  min-height: 160px;
}

.mini-chip {
  padding: 2px 8px;
  font-size: 10px;
  min-height: 0;
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
</style>
