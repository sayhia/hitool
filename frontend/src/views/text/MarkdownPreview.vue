<script setup lang="ts">
/**
 * Markdown preview.
 *
 * The renderer escapes every angle bracket in the source rather than passing
 * raw HTML through, which is what makes `v-html` safe here: nothing in a
 * pasted document can become an element. That is a real limitation and it is
 * stated in the inspector rather than hidden.
 */
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText, toast } from "../../stores/toast";
import { errText } from "../../lib/err";
import { pickFiles, readFileBytes, formatBytes, inWails, outputDir, writeFileChunked } from "../../lib/backend";
import { onFilesDropped, dragActive, useFileHandoff } from "../../lib/drop";
import { decodeText, MAX_TEXT_BYTES } from "../../lib/textfile";
import { render, toPlainText } from "../../lib/markdown";
import { countWords } from "../../lib/lines";
import type { FileInfo } from "@bindings/hitool/services/models";

const SAMPLE = `# hitool

一个**本地运行**的工具箱，文件不出本机。

## 特点

- 53 个工具，覆盖文档、图片、文本与开发
- 所有处理都在本机完成
- 支持 \`拖入文件\` 直接开始

> 原始 HTML 会被转义显示，不会当作标签渲染。

| 分类 | 数量 |
| --- | ---: |
| 文档 | 9 |
| 开发 | 12 |

\`\`\`go
func main() {
    fmt.Println("hi")
}
\`\`\`

- [x] 已完成的事项
- [ ] 待办事项

见 [项目主页](https://example.com)。
`;

const src = ref(SAMPLE);
const name = ref("");
const showToc = ref(true);
const exporting = ref(false);

const result = computed(() => render(src.value));
const plain = computed(() => toPlainText(src.value));

const counts = computed(() => ({
  chars: [...src.value].length,
  words: countWords(plain.value),
  lines: src.value ? src.value.split("\n").length : 0,
  headings: result.value.headings.length,
}));

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
    name.value = f.name;
  } catch (e) {
    toast(errText(e), "fail");
  }
}

onFilesDropped((files) => load(files[0]));
useFileHandoff((files) => load(files[0]));

async function choose() {
  const paths = await pickFiles(t("common.selectFiles"), "Markdown", ["md", "markdown", "txt"], false);
  if (!paths.length) return;
  const { StatFiles } = await import("@bindings/hitool/services/systemservice");
  const stat = (await StatFiles(paths)) ?? [];
  if (stat.length) load(stat[0]);
}

/** A standalone page, styled well enough to read and to print. */
function standalone(): string {
  return `<!doctype html>
<html lang="zh">
<meta charset="utf-8">
<title>${name.value || "Markdown"}</title>
<style>
:root { color-scheme: light dark; --ink:#26241f; --dim:#8a867e; --line:#e3e1dc; --acc:#3376fb; --bg:#fff; --code:#f6f5f2; }
@media (prefers-color-scheme: dark) { :root { --ink:#e8e6e1; --dim:#8a867e; --line:#2e2c29; --acc:#8f92f0; --bg:#161514; --code:#1f1e1c; } }
body { max-width:46rem; margin:0 auto; padding:40px 24px; background:var(--bg); color:var(--ink);
  font:15px/1.75 -apple-system,system-ui,"PingFang SC","Microsoft YaHei",sans-serif; }
h1,h2,h3,h4 { line-height:1.3; margin:1.8em 0 .6em; }
h1 { font-size:1.9em; } h2 { font-size:1.45em; border-bottom:1px solid var(--line); padding-bottom:.3em; }
a { color:var(--acc); }
code { background:var(--code); padding:.15em .35em; border-radius:4px; font-size:.9em;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
pre { background:var(--code); padding:14px 16px; border-radius:8px; overflow-x:auto; }
pre code { background:none; padding:0; }
blockquote { margin:1em 0; padding:.2em 1em; border-left:3px solid var(--line); color:var(--dim); }
table { border-collapse:collapse; width:100%; margin:1em 0; }
th,td { border:1px solid var(--line); padding:7px 10px; text-align:left; }
th { background:var(--code); }
img { max-width:100%; }
hr { border:0; border-top:1px solid var(--line); margin:2em 0; }
li.task { list-style:none; margin-left:-1.2em; }
</style>
${result.value.html}
`;
}

async function exportHtml() {
  if (exporting.value) return;
  if (!inWails()) {
    toast(t("md.exportDesktopOnly"), "fail");
    return;
  }
  exporting.value = true;
  try {
    const dir = await outputDir("Markdown");
    const stem = (name.value || "document").replace(/\.[^.]+$/, "");
    const file = `${stem}.html`;
    await writeFileChunked(`${dir}/${file}`, new TextEncoder().encode(standalone()));
    toast(t("md.exported", { path: file }), "ok");
  } catch (e) {
    toast(errText(e), "fail");
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <ToolFrame tool-id="markdown-preview" shape="flow">
    <div class="field grow-field" :class="{ hot: dragActive }" data-file-drop-target="markdown">
      <div class="head">
        <span class="lab">{{ t("md.source") }}</span>
        <span v-if="name" class="fname truncate" :title="name">{{ name }}</span>
        <button class="mini" :title="t('diff.openFile')" @click="choose">
          <Icon name="FolderOpen" />
        </button>
      </div>
      <textarea
        v-model="src"
        class="textarea mono doc"
        :placeholder="t('md.sourcePh')"
        spellcheck="false"
        @input="name = ''"
      ></textarea>
    </div>

    <div class="row">
      <button class="btn btn-sm btn-quiet" :disabled="!src" @click="copyText(result.html, t('common.copied'))">
        <Icon name="Code2" /> {{ t("md.copyHtml") }}
      </button>
      <button class="btn btn-sm btn-quiet" :disabled="!src" @click="copyText(plain, t('common.copied'))">
        {{ t("md.copyText") }}
      </button>
      <button class="btn btn-sm btn-quiet" :disabled="!src" @click="src = SAMPLE; name = ''">
        {{ t("md.sample") }}
      </button>
      <span class="hint drophint">{{ t("md.dropHint") }}</span>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("md.preview") }}</span>
        <span class="lab">{{ counts.words }} {{ t("md.words") }} · {{ counts.chars }} {{ t("md.chars") }}</span>
        <button class="btn btn-sm btn-quiet" :disabled="!src || exporting" @click="exportHtml">
          <Icon name="Download" /> HTML
        </button>
      </div>

      <div class="preview scroll-y">
        <!-- Safe by construction: the renderer escapes all source markup, so
             nothing here came from the document as an element. -->
        <article v-if="src.trim()" class="md" v-html="result.html"></article>
        <p v-else class="hint pad">{{ t("md.idle") }}</p>
      </div>
    </template>

    <template #inspector>
      <InspectorSection v-if="result.headings.length" :title="t('md.toc')" icon="List" :open="showToc">
        <div class="toc">
          <a
            v-for="h in result.headings"
            :key="h.id"
            class="tocitem"
            :class="`l${h.level}`"
            :href="`#${h.id}`"
          >
            {{ h.text }}
          </a>
        </div>
      </InspectorSection>

      <InspectorSection :title="t('md.stats')" icon="BarChart3">
        <div class="stats">
          <span><span class="lab">{{ t("md.words") }}</span> {{ counts.words }}</span>
          <span><span class="lab">{{ t("md.chars") }}</span> {{ counts.chars }}</span>
          <span><span class="lab">{{ t("md.lines") }}</span> {{ counts.lines }}</span>
          <span><span class="lab">{{ t("md.headings") }}</span> {{ counts.headings }}</span>
        </div>
      </InspectorSection>

      <InspectorSection :title="t('md.about')" icon="Info">
        <p class="hint">{{ t("md.aboutHtml") }}</p>
        <p class="hint">{{ t("md.aboutLinks") }}</p>
        <p class="hint">{{ t("md.aboutSubset") }}</p>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
.grow-field {
  flex: 1;
  min-height: 0;
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

.fname {
  flex: 1;
  min-width: 0;
  font-size: var(--t-xs);
  color: var(--ink-3);
  font-family: var(--f-mono);
}

.mini {
  margin-left: auto;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
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
  min-height: 280px;
}

.row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.drophint {
  margin-left: auto;
}

.res-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.res-head .btn {
  margin-left: auto;
}

.preview {
  flex: 1;
  padding: 18px 22px 40px;
}

.pad {
  padding: 4px 0;
}

.toc {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tocitem {
  font-size: var(--t-xs);
  color: var(--ink-2);
  text-decoration: none;
  padding: 3px 5px;
  border-radius: var(--r-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tocitem:hover {
  background: var(--s-3);
  color: var(--ink);
}

.l2 { padding-left: 15px; }
.l3 { padding-left: 27px; }
.l4, .l5, .l6 { padding-left: 39px; }

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 10px;
  font-size: var(--t-xs);
}

/* ---- rendered document ---- */
.md :deep(h1),
.md :deep(h2),
.md :deep(h3),
.md :deep(h4) {
  line-height: 1.3;
  margin: 1.6em 0 0.55em;
  font-weight: 650;
}

.md :deep(h1) {
  font-size: 1.7em;
  margin-top: 0;
}

.md :deep(h2) {
  font-size: 1.3em;
  border-bottom: 1px solid var(--line);
  padding-bottom: 0.28em;
}

.md :deep(h3) {
  font-size: 1.1em;
}

.md :deep(p),
.md :deep(ul),
.md :deep(ol),
.md :deep(table) {
  margin: 0.85em 0;
  line-height: 1.75;
}

.md :deep(a) {
  color: var(--acc);
}

.md :deep(code) {
  background: var(--s-2);
  padding: 0.14em 0.36em;
  border-radius: 4px;
  font-family: var(--f-mono);
  font-size: 0.88em;
}

.md :deep(pre) {
  background: var(--s-2);
  padding: 12px 14px;
  border-radius: var(--r);
  overflow-x: auto;
}

.md :deep(pre code) {
  background: none;
  padding: 0;
  font-size: var(--t-sm);
  line-height: 1.7;
}

.md :deep(blockquote) {
  margin: 1em 0;
  padding: 0.15em 1em;
  border-left: 3px solid var(--line);
  color: var(--ink-3);
}

.md :deep(table) {
  border-collapse: collapse;
  width: 100%;
  font-size: var(--t-sm);
}

.md :deep(th),
.md :deep(td) {
  border: 1px solid var(--line);
  padding: 6px 9px;
  text-align: left;
}

.md :deep(th) {
  background: var(--s-2);
  font-weight: 600;
}

.md :deep(hr) {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 1.8em 0;
}

.md :deep(img) {
  max-width: 100%;
  border-radius: var(--r-sm);
}

.md :deep(li) {
  margin: 0.25em 0;
}

.md :deep(li.task) {
  list-style: none;
  margin-left: -1.15em;
}

.md :deep(ul),
.md :deep(ol) {
  padding-left: 1.3em;
}
</style>
