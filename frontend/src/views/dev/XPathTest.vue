<script setup lang="ts">
/**
 * Selector tester. The webview ships both engines — a full XPath 1.0 one
 * (DOMParser + document.evaluate) and the CSS one behind querySelectorAll —
 * so neither a backend nor a third-party parser is involved. Scraping and
 * end-to-end tests are written against whichever of the two the tool at hand
 * speaks, and people rarely get to pick, so both belong here.
 */
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText, toast } from "../../stores/toast";
import { errText } from "../../lib/err";
import { pickFiles, readFileBytes, formatBytes, baseName } from "../../lib/backend";
import { onFilesDropped, dragActive, useFileHandoff, extOf } from "../../lib/drop";
import { decodeText, MAX_TEXT_BYTES } from "../../lib/textfile";
import type { FileInfo } from "@bindings/hitool/services/models";

const source = ref("");
const srcName = ref("");
const mode = ref<"html" | "xml">("html");
const lang = ref<"xpath" | "css">("xpath");

// One draft per language: switching to compare the two shouldn't cost you the
// expression you were in the middle of writing.
const drafts = ref({ xpath: "", css: "" });
const expr = computed({
  get: () => drafts.value[lang.value],
  set: (v: string) => (drafts.value[lang.value] = v),
});

const BASIC_TEMPLATES = [
  { label: "//div", expr: "//div" },
  { label: "//a/@href", expr: "//a/@href" },
  { label: "class", expr: "//*[@class='item']" },
  { label: "id", expr: "//*[@id='main']" },
  { label: "text()", expr: "//h1/text()" },
];

const MORE_TEMPLATES = [
  { label: "contains", expr: "//*[contains(text(),'foo')]" },
  { label: "starts-with", expr: "//*[starts-with(@href,'/a')]" },
  { label: "nth", expr: "(//li)[2]" },
  { label: "last()", expr: "(//li)[last()]" },
  { label: "parent", expr: "//span/parent::*" },
  { label: "ancestor", expr: "//a/ancestor::ul" },
  { label: "following", expr: "//li[1]/following-sibling::li" },
  { label: "not()", expr: "//li[not(@class='done')]" },
  { label: "and / or", expr: "//*[@class='item' or @class='done']" },
  { label: "count()", expr: "count(//li)" },
];


const CSS_TEMPLATES = [
  { label: "tag", expr: "div" },
  { label: "class", expr: ".item" },
  { label: "id", expr: "#main" },
  { label: "child", expr: "ul > li" },
  { label: "descendant", expr: ".list a" },
  { label: "attr", expr: "a[href]" },
  { label: "prefix", expr: "a[href^='/a']" },
  { label: "nth", expr: "li:nth-child(2)" },
  { label: "last", expr: "li:last-child" },
  { label: ":not()", expr: "li:not(.done)" },
  { label: ":has()", expr: "li:has(a)" },
  { label: "union", expr: "h1, h2" },
];

/** XPath 1.0 quick reference — the syntax people look up mid-task. */
const REFERENCE = [
  {
    key: "basic",
    items: [
      { syntax: "/", desc: "从根节点开始" },
      { syntax: "//", desc: "文档中任意位置" },
      { syntax: ".", desc: "当前节点" },
      { syntax: "..", desc: "父节点" },
      { syntax: "@attr", desc: "选取属性" },
      { syntax: "*", desc: "任意元素" },
      { syntax: "@*", desc: "任意属性" },
      { syntax: "|", desc: "合并两个结果集" },
    ],
  },
  {
    key: "predicate",
    items: [
      { syntax: "[n]", desc: "第 n 个（从 1 开始）" },
      { syntax: "[last()]", desc: "最后一个" },
      { syntax: "[@k='v']", desc: "属性等于某值" },
      { syntax: "[@k]", desc: "含有该属性" },
      { syntax: "[not(...)]", desc: "逻辑非" },
      { syntax: "[a and b]", desc: "同时满足" },
      { syntax: "[a or b]", desc: "满足其一" },
      { syntax: "[position()<3]", desc: "位置条件" },
    ],
  },
  {
    key: "axis",
    items: [
      { syntax: "parent::", desc: "父级" },
      { syntax: "child::", desc: "子级" },
      { syntax: "ancestor::", desc: "所有祖先" },
      { syntax: "descendant::", desc: "所有后代" },
      { syntax: "following-sibling::", desc: "后面的同级" },
      { syntax: "preceding-sibling::", desc: "前面的同级" },
      { syntax: "self::", desc: "自身" },
    ],
  },
  {
    key: "func",
    items: [
      { syntax: "text()", desc: "文本节点" },
      { syntax: "contains(a,b)", desc: "a 是否包含 b" },
      { syntax: "starts-with(a,b)", desc: "a 是否以 b 开头" },
      { syntax: "normalize-space()", desc: "去除首尾与重复空白" },
      { syntax: "count(...)", desc: "计数" },
      { syntax: "string-length()", desc: "字符串长度" },
      { syntax: "concat(a,b)", desc: "拼接" },
      { syntax: "translate(s,a,b)", desc: "字符替换" },
    ],
  },
];

/** CSS selector quick reference. Level 4 items are limited to what WebKit
 *  actually ships, so nothing here silently matches nothing. */
const CSS_REFERENCE = [
  {
    key: "css_basic",
    items: [
      { syntax: "*", desc: "任意元素" },
      { syntax: "div", desc: "按标签名" },
      { syntax: ".cls", desc: "按 class" },
      { syntax: "#id", desc: "按 id" },
      { syntax: "a, b", desc: "并集" },
    ],
  },
  {
    key: "css_combinator",
    items: [
      { syntax: "a b", desc: "后代（任意层级）" },
      { syntax: "a > b", desc: "直接子元素" },
      { syntax: "a + b", desc: "紧邻的下一个同级" },
      { syntax: "a ~ b", desc: "后面所有同级" },
    ],
  },
  {
    key: "css_attr",
    items: [
      { syntax: "[k]", desc: "含有该属性" },
      { syntax: "[k='v']", desc: "属性等于某值" },
      { syntax: "[k^='v']", desc: "以某值开头" },
      { syntax: "[k$='v']", desc: "以某值结尾" },
      { syntax: "[k*='v']", desc: "包含某值" },
      { syntax: "[k~='v']", desc: "空格分隔的词之一" },
      { syntax: "[k='v' i]", desc: "忽略大小写" },
    ],
  },
  {
    key: "css_pseudo",
    items: [
      { syntax: ":first-child", desc: "同级中的第一个" },
      { syntax: ":last-child", desc: "同级中的最后一个" },
      { syntax: ":nth-child(2)", desc: "同级中的第 n 个" },
      { syntax: ":nth-of-type(2)", desc: "同类型中的第 n 个" },
      { syntax: ":not(.cls)", desc: "逻辑非" },
      { syntax: ":has(a)", desc: "含有匹配的后代" },
      { syntax: ":empty", desc: "没有子节点" },
    ],
  },
];


const SAMPLE_HTML = `<div id="main">
  <h1>Weekly report</h1>
  <ul class="list">
    <li class="item"><a href="/a">First</a></li>
    <li class="item"><a href="/b">Second</a></li>
    <li class="item done"><a href="/c">Third</a></li>
  </ul>
</div>`;

const SAMPLE_XML = `<catalog>
  <book id="b1" lang="en">
    <title>Go in Practice</title>
    <price currency="USD">39.99</price>
  </book>
  <book id="b2" lang="zh">
    <title>深入 Vue 3</title>
    <price currency="CNY">89.00</price>
  </book>
</catalog>`;

interface NodeHit {
  kind: string;
  name: string;
  value: string;
}

interface Outcome {
  hits: NodeHit[];
  /** Hit count before the LIMIT cut, so the pane can say "N total". */
  total: number;
  error: string;
}

/** Rows rendered per run. A selector that hits thousands of nodes is a
 *  selector still being narrowed down; listing them all just stalls the pane. */
const LIMIT = 200;

const outcome = computed<Outcome>(() => {
  if (!source.value.trim() || !expr.value.trim()) return { hits: [], total: 0, error: "" };

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(
      source.value,
      mode.value === "html" ? "text/html" : "application/xml",
    );
  } catch (e) {
    return { hits: [], total: 0, error: `${t("xpath.parseError")}: ${(e as Error).message}` };
  }

  // XML parse failures surface as a <parsererror> node rather than a throw.
  const parseErr = doc.querySelector("parsererror");
  if (parseErr) {
    return {
      hits: [],
      total: 0,
      error: `${t("xpath.parseError")}: ${parseErr.textContent?.trim() ?? ""}`,
    };
  }

  if (lang.value === "css") {
    try {
      // CSS selects elements and nothing else — no attribute or text results,
      // and no numbers. That is the language, not a shortcut taken here.
      const found = doc.querySelectorAll(expr.value);
      const hits: NodeHit[] = [];
      for (let i = 0; i < found.length && hits.length < LIMIT; i++) {
        const n = found[i];
        hits.push({ kind: nodeKind(n), name: n.nodeName, value: describe(n) });
      }
      return { hits, total: found.length, error: "" };
    } catch (e) {
      return { hits: [], total: 0, error: `${t("xpath.cssError")}: ${(e as Error).message}` };
    }
  }

  try {
    const res = doc.evaluate(expr.value, doc, null, XPathResult.ANY_TYPE, null);
    const hits: NodeHit[] = [];
    // Scalar results are one value; node-set totals come from the snapshot
    // below, so the pane can report "N hits" even after the LIMIT cut.
    let total = 0;

    switch (res.resultType) {
      case XPathResult.NUMBER_TYPE:
        hits.push({ kind: "number", name: "", value: String(res.numberValue) });
        total = 1;
        break;
      case XPathResult.STRING_TYPE:
        hits.push({ kind: "string", name: "", value: res.stringValue });
        total = 1;
        break;
      case XPathResult.BOOLEAN_TYPE:
        hits.push({ kind: "boolean", name: "", value: String(res.booleanValue) });
        total = 1;
        break;
      default: {
        // Re-evaluate as a snapshot so the iterator can't be invalidated.
        const snap = doc.evaluate(expr.value, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        total = snap.snapshotLength;
        for (let i = 0; i < snap.snapshotLength && hits.length < LIMIT; i++) {
          const n = snap.snapshotItem(i)!;
          hits.push({
            kind: nodeKind(n),
            name: n.nodeName,
            value: describe(n),
          });
        }
      }
    }
    return { hits, total, error: "" };
  } catch (e) {
    return { hits: [], total: 0, error: `${t("xpath.exprError")}: ${(e as Error).message}` };
  }
});

/** A default XML namespace silently empties //tag lookups — the single most
 *  common "my XPath is fine, why zero hits" on real-world feeds. */
const showNsHint = computed(
  () =>
    !outcome.value.error &&
    !outcome.value.hits.length &&
    mode.value === "xml" &&
    lang.value === "xpath" &&
    !!source.value.trim() &&
    !!expr.value.trim(),
);

/** Copy every hit value, one per line — the extract-then-paste scraping step. */
function copyHits() {
  copyText(outcome.value.hits.map((h) => h.value).join("\n"), t("common.copied"));
}

function nodeKind(n: Node): string {
  switch (n.nodeType) {
    case Node.ELEMENT_NODE:
      return "element";
    case Node.ATTRIBUTE_NODE:
      return "attr";
    case Node.TEXT_NODE:
      return "text";
    case Node.COMMENT_NODE:
      return "comment";
    default:
      return "node";
  }
}

/** Elements show their serialised markup; everything else shows its value. */
function describe(n: Node): string {
  if (n.nodeType === Node.ELEMENT_NODE) {
    const html = (n as Element).outerHTML ?? "";
    return html.length > 400 ? html.slice(0, 400) + "…" : html;
  }
  return (n.nodeValue ?? "").trim();
}

const SAMPLE_EXPR = {
  xpath: { html: "//li[@class='item']/a", xml: "//book/title" },
  css: { html: "ul.list > li.item a", xml: "book > title" },
};

function loadSample() {
  source.value = mode.value === "html" ? SAMPLE_HTML : SAMPLE_XML;
  srcName.value = "";
  if (!expr.value) expr.value = SAMPLE_EXPR[lang.value][mode.value];
}

// ---------- document files ----------
// Selectors are usually written *against a real page or feed*, so the source
// arrives as a dropped .html/.xml file as often as a paste. Same decode path
// as the other text tools: size guard, binary sniff, BOM/charset aware.

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
    const ext = extOf(f.name || f.path);
    mode.value = ext === "html" || ext === "htm" ? "html" : "xml";
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
  const paths = await pickFiles(t("xpath.pick"), "Document", ["html", "htm", "xml", "svg"], false);
  if (!paths[0]) return;
  void load({ path: paths[0], name: baseName(paths[0]), size: 0 });
}
</script>

<template>
  <ToolFrame tool-id="xpath-test" shape="flow">
    <div class="row">
      <div class="field">
        <span class="lab">{{ t("xpath.lang") }}</span>
        <div class="seg">
          <button :class="{ on: lang === 'xpath' }" @click="lang = 'xpath'">{{ t("xpath.langXpath") }}</button>
          <button :class="{ on: lang === 'css' }" @click="lang = 'css'">{{ t("xpath.langCss") }}</button>
        </div>
      </div>
      <div class="field">
        <span class="lab">{{ t("xpath.mode") }}</span>
        <div class="seg">
          <button :class="{ on: mode === 'html' }" @click="mode = 'html'">{{ t("xpath.modeHtml") }}</button>
          <button :class="{ on: mode === 'xml' }" @click="mode = 'xml'">{{ t("xpath.modeXml") }}</button>
        </div>
      </div>
      <button class="chip sample" @click="pick">
        <Icon name="FolderOpen" />
        {{ t("xpath.pick") }}
      </button>
      <button class="chip sample" @click="loadSample">
        <Icon name="FileCode2" />
        {{ mode === "html" ? t("xpath.sampleHtml") : t("xpath.sampleXml") }}
      </button>
      <button
        class="chip sample"
        :disabled="!source"
        @click="
          source = '';
          srcName = '';
        "
      >
        <Icon name="X" /> {{ t("xpath.clearSource") }}
      </button>
    </div>

    <div class="field">
      <span class="lab">{{ lang === "css" ? t("xpath.cssExpr") : t("xpath.expr") }}</span>
      <input
        v-model="expr"
        class="input mono"
        :class="{ bad: !!outcome.error }"
        :placeholder="lang === 'css' ? t('xpath.cssExprPh') : t('xpath.exprPh')"
        spellcheck="false"
      />
    </div>

    <div class="field grow-field" :class="{ hot: dragActive }" data-file-drop-target="xpath-test">
      <span class="lab">
        {{ t("xpath.source") }}
        <span v-if="srcName" class="srcname mono" :title="srcName">{{ srcName }}</span>
      </span>
      <textarea
        v-model="source"
        class="textarea mono doc"
        :placeholder="t('xpath.sourcePh')"
        spellcheck="false"
      ></textarea>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("xpath.results") }}</span>
        <span class="badge" :class="{ acc: outcome.hits.length }">
          {{ outcome.hits.length ? t("xpath.nodeCount", { n: outcome.total }) : t("xpath.noResult") }}
        </span>
        <button v-if="outcome.hits.length" class="btn btn-sm btn-quiet rescopy" @click="copyHits">
          <Icon name="Copy" /> {{ t("xpath.copyHits") }}
        </button>
      </div>
      <div class="results scroll-y">
        <p v-if="outcome.error" class="banner fail">{{ outcome.error }}</p>
        <template v-else-if="outcome.hits.length">
          <div v-for="(h, i) in outcome.hits" :key="i" class="hit">
            <div class="hit-head">
              <span class="idx mono">{{ i + 1 }}</span>
              <span class="badge">{{ h.kind }}</span>
              <span v-if="h.name" class="name mono">{{ h.name }}</span>
            </div>
            <code class="val">{{ h.value }}</code>
          </div>
          <p v-if="outcome.total > outcome.hits.length" class="hint">
            {{ t("xpath.truncated", { n: outcome.total, limit: outcome.hits.length }) }}
          </p>
        </template>
        <p v-else-if="showNsHint" class="hint">{{ t("xpath.nsHint") }}</p>
        <p v-else class="hint">{{ t("regex.empty") }}</p>
      </div>
    </template>

    <template #inspector>
      <InspectorSection :title="t('xpath.templates')" icon="Bookmark">
        <div class="chips">
          <button
            v-for="tp in lang === 'css' ? CSS_TEMPLATES : [...BASIC_TEMPLATES, ...MORE_TEMPLATES]"
            :key="tp.label"
            class="chip"
            @click="expr = tp.expr"
          >
            {{ tp.label }}
          </button>
        </div>
      </InspectorSection>

      <InspectorSection
        v-for="g in lang === 'css' ? CSS_REFERENCE : REFERENCE"
        :key="g.key"
        :title="t(`xpath.ref_${g.key}`)"
        icon="BookOpen"
        :open="g.key === 'basic' || g.key === 'css_basic'"
      >
        <div class="refitems">
          <button
            v-for="it in g.items"
            :key="it.syntax"
            class="refitem"
            :title="t('xpath.insert')"
            @click="expr += it.syntax"
          >
            <code class="mono">{{ it.syntax }}</code>
            <span>{{ it.desc }}</span>
          </button>
        </div>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
.row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.sample {
  margin-bottom: 3px;
}

.input.bad {
  border-color: var(--fail);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.grow-field {
  flex: 1;
  min-height: 0;
}

/* Same drop affordance as the other file tools: a ring while a drag hovers. */
.grow-field.hot {
  box-shadow: 0 0 0 2px var(--acc);
  border-radius: var(--r);
}

/* Name of the loaded document, tucked after the field label. */
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

.doc {
  flex: 1;
  min-height: 260px;
}

.res-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.rescopy {
  margin-left: auto;
}

.results {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hit {
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-1);
  padding: 9px 11px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.hit-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.idx {
  font-size: var(--t-xs);
  color: var(--ink-3);
  min-width: 16px;
}

.name {
  font-size: var(--t-sm);
  color: var(--ink-2);
}

.val {
  font-family: var(--f-mono);
  font-size: var(--t-sm);
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--ink);
  user-select: text;
}

.refitems {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.refitem {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  cursor: pointer;
  font-family: var(--f-ui);
  text-align: left;
}

.refitem:hover {
  background: var(--s-3);
}

.refitem code {
  flex-shrink: 0;
  min-width: 104px;
  font-size: var(--t-xs);
  color: var(--acc);
}

.refitem span {
  font-size: var(--t-xs);
  color: var(--ink-2);
}
</style>
