<script setup lang="ts">
/**
 * Find & replace over plain text — the one every editor has, wired to the
 * same match engine as the regex tester. Literal mode escapes the query and
 * compiles it to a regex too, so both modes share one match/replace path and
 * $-references keep their meaning; only the interpretation of the query
 * differs. Documents arrive as paste or as dropped txt/log/md files, like the
 * other text-facing tools.
 */
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText, toast } from "../../stores/toast";
import { errText } from "../../lib/err";
import { pickFiles, readFileBytes, formatBytes, baseName } from "../../lib/backend";
import { onFilesDropped, dragActive, useFileHandoff } from "../../lib/drop";
import { decodeText, MAX_TEXT_BYTES } from "../../lib/textfile";
import { replaceAll } from "../../lib/regexReplace";
import { compileFind } from "../../lib/textReplace";
import type { FileInfo } from "@bindings/hitool/services/models";

const SAMPLE = `HiTool 是一个完全本地运行的工具箱。
注意：HiToolbox 是另一个单词，全字匹配不会命中它。
The quick brown fox jumps over the lazy dog. The end.
the THE ThE —— 关闭大小写敏感后它们都会被找到。
TODO: 把 TODO 全部删掉试试。`;

const source = ref("");
const srcName = ref("");
const query = ref("");
const replacement = ref("");
const mode = ref<"plain" | "regex">("plain");
const caseSensitive = ref(false);
const wholeWord = ref(false);

const compiled = computed(() =>
  compileFind({
    query: query.value,
    regex: mode.value === "regex",
    caseSensitive: caseSensitive.value,
    wholeWord: wholeWord.value,
  }),
);

const result = computed(() =>
  replaceAll(source.value, compiled.value.error ? null : compiled.value.re, replacement.value),
);

const ready = computed(() => !!source.value && !!query.value && !compiled.value.error);

function clear() {
  query.value = "";
  replacement.value = "";
  source.value = "";
  srcName.value = "";
}

// ---------- document files ----------

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
    source.value = d.text;
    srcName.value = f.name || baseName(f.path);
  } catch (e) {
    toast(errText(e), "fail");
  }
}

onFilesDropped((files) => {
  if (files[0]) void load(files[0]);
});
useFileHandoff((files) => {
  if (files[0]) void load(files[0]);
});

async function pick() {
  const paths = await pickFiles(t("trep.pick"), "Text", ["txt", "log", "md"], false);
  if (!paths[0]) return;
  void load({ path: paths[0], name: baseName(paths[0]), size: 0 });
}
</script>

<template>
  <ToolFrame tool-id="text-replace" shape="flow">
    <div class="field">
      <span class="lab">{{ t("trep.find") }}</span>
      <div class="findline" :class="{ bad: !!compiled.error }">
        <div class="seg modeseg">
          <button :class="{ on: mode === 'plain' }" @click="mode = 'plain'">
            {{ t("trep.modePlain") }}
          </button>
          <button :class="{ on: mode === 'regex' }" @click="mode = 'regex'">
            {{ t("trep.modeRegex") }}
          </button>
        </div>
        <input
          v-model="query"
          class="findin mono"
          :placeholder="t('trep.findPh')"
          spellcheck="false"
          autocomplete="off"
        />
        <button
          class="opt"
          :class="{ on: caseSensitive }"
          :title="t('trep.caseSensitive')"
          @click="caseSensitive = !caseSensitive"
        >
          Aa
        </button>
        <button
          v-if="mode === 'plain'"
          class="opt"
          :class="{ on: wholeWord }"
          :title="t('trep.wholeWord')"
          @click="wholeWord = !wholeWord"
        >
          <Icon name="WholeWord" />
        </button>
      </div>
      <p v-if="compiled.error" class="err mono">{{ compiled.error }}</p>
    </div>

    <div class="field">
      <span class="lab">{{ t("trep.replaceWith") }}</span>
      <input
        v-model="replacement"
        class="input mono"
        :placeholder="t('trep.replacePh')"
        spellcheck="false"
        autocomplete="off"
      />
      <p class="hint">{{ mode === "regex" ? t("regex.replaceHint") : t("trep.hintPlain") }}</p>
    </div>

    <div class="row">
      <button class="chip" @click="pick">
        <Icon name="FolderOpen" /> {{ t("trep.pick") }}
      </button>
      <button class="chip" @click="source = SAMPLE; srcName = ''">{{ t("json.sample") }}</button>
      <button class="chip" :disabled="!source && !query" @click="clear">
        {{ t("common.clear") }}
      </button>
    </div>

    <div class="field grow-field" :class="{ hot: dragActive }" data-file-drop-target="text-replace">
      <span class="lab">
        {{ t("trep.source") }}
        <span v-if="srcName" class="srcname mono" :title="srcName">{{ srcName }}</span>
      </span>
      <textarea
        v-model="source"
        class="textarea mono subject"
        :placeholder="t('trep.sourcePh')"
        spellcheck="false"
      ></textarea>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("trep.result") }}</span>
        <span v-if="query" class="badge" :class="{ acc: result.count }">
          {{
            result.count
              ? t("regex.matchCount", { n: result.count })
              : t("regex.noMatch")
          }}
        </span>
        <button
          class="btn btn-sm btn-quiet rescopy"
          :disabled="!ready"
          @click="copyText(result.output, t('common.copied'))"
        >
          <Icon name="Copy" /> {{ t("regex.copyResult") }}
        </button>
      </div>

      <div class="preview full mono scroll-y">
        <template v-if="source">
          <span v-for="(s, i) in result.segments" :key="i" :class="{ sub: s.hit }">{{ s.text }}</span>
        </template>
        <span v-else class="hint">{{ t("trep.empty") }}</span>
        <span v-if="source && !query" class="hint">{{ t("trep.noQuery") }}</span>
      </div>
    </template>
  </ToolFrame>
</template>

<style scoped>
/* Find line: mode switch and toggles ride beside the query, like the
   regex tester's pattern line. */
.findline {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 40px;
  padding: 0 8px 0 5px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r);
  background: var(--s-1);
}

.findline:focus-within {
  border-color: var(--acc);
  box-shadow: var(--focus-ring);
}

.findline.bad {
  border-color: var(--fail);
}

.modeseg {
  flex-shrink: 0;
}

.findin {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  outline: none;
  color: var(--ink);
  font-size: var(--t-md);
}

.opt {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--s-2);
  color: var(--ink-3);
  font-family: var(--f-ui);
  font-size: var(--t-sm);
  cursor: pointer;
}

.opt :deep(svg) {
  width: 14px;
  height: 14px;
}

.opt.on {
  background: var(--acc);
  border-color: var(--acc);
  color: var(--acc-ink);
  font-weight: 600;
}

.err {
  font-size: var(--t-xs);
  color: var(--fail);
  word-break: break-word;
}

.row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.grow-field {
  flex: 1;
  min-height: 0;
}

.grow-field.hot {
  box-shadow: 0 0 0 2px var(--acc);
  border-radius: var(--r);
}

.srcname {
  margin-left: 8px;
  padding: 0 7px;
  border-radius: var(--r-pill);
  background: var(--s-3);
  color: var(--ink-3);
  font-size: var(--t-xs);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  vertical-align: baseline;
}

.subject {
  flex: 1;
  min-height: 220px;
}

/* result pane */
.res-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.rescopy {
  margin-left: auto;
}

/* Replaced runs wear the success colour: like the regex tester's replace
   view, what is marked here is what the replacement *produced*. */
.preview {
  flex: 1 1 auto;
  padding: 12px 14px;
  font-size: var(--t-sm);
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}

.preview .sub {
  background: var(--ok-wash, var(--acc-wash-2));
  color: var(--ok, var(--acc));
  border-radius: 3px;
  padding: 0 1px;
  font-weight: 600;
}
</style>
