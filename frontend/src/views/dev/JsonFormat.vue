<script setup lang="ts">
/**
 * JSON format / minify / validate / escape, with a collapsible tree view and
 * find-replace over the input. Parse errors resolve to line and column.
 */
import { computed, nextTick, ref, watch } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import JsonTree from "../../components/JsonTree.vue";
import { t } from "../../lib/i18n";
import { copyText, toast } from "../../stores/toast";
import { preview, query } from "../../lib/jsonpath";

const input = ref("");
const output = ref("");
const indent = ref(2);
const sortKeys = ref(false);
const view = ref<"tree" | "text" | "path">("tree");

// JSONPath query, over the parsed document rather than the formatted text —
// so it works even when the output pane is showing something else.
const pathExpr = ref("$..*");

const pathResult = computed(() => {
  if (!valid.value) return { matches: [], error: "" };
  if (!pathExpr.value.trim()) return { matches: [], error: "" };
  return query(shaped.value, pathExpr.value);
});

const PATH_EXAMPLES = [
  "$..*",
  "$.members[*].name",
  "$.members[?(@.active == true)].name",
  "$.members[-1]",
  "$..roles[0]",
  "$.config.limits['rps','burst']",
];

// find / replace
const showFind = ref(false);
const findText = ref("");
const replaceText = ref("");
const matchCase = ref(false);
const wholeWord = ref(false);
const useRegex = ref(false);
const hitIndex = ref(0);
const inputEl = ref<HTMLTextAreaElement | null>(null);

const SIMPLE_SAMPLE = `{
  "name": "HiTool",
  "version": "0.3.0",
  "local": true,
  "tools": 33
}`;

const COMPLEX_SAMPLE = `{
  "team": "platform",
  "members": [
    { "id": 1, "name": "Ada", "roles": ["dev", "lead"], "active": true },
    { "id": 2, "name": "Bo", "roles": ["ops"], "active": false, "note": null }
  ],
  "config": {
    "retry": { "max": 3, "backoffMs": 250 },
    "regions": ["cn-north", "us-east"],
    "limits": { "rps": 120.5, "burst": 200 }
  }
}`;

/** Parse once; everything else keys off this. */
const parsed = computed<{ value: unknown; error: string; line: number; col: number }>(() => {
  const raw = input.value.trim();
  if (!raw) return { value: undefined, error: "", line: 0, col: 0 };
  try {
    return { value: JSON.parse(raw), error: "", line: 0, col: 0 };
  } catch (e) {
    const msg = (e as Error).message;
    // V8 reports a character offset; turn it into line/column.
    const at = /position (\d+)/.exec(msg);
    let line = 0;
    let col = 0;
    if (at) {
      const pos = Number(at[1]);
      const before = raw.slice(0, pos);
      line = before.split("\n").length;
      col = pos - before.lastIndexOf("\n");
    }
    return { value: undefined, error: msg, line, col };
  }
});

const valid = computed(() => !!input.value.trim() && !parsed.value.error);

/** Stable key order, applied recursively. */
function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      out[k] = sorted((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

const shaped = computed(() => (sortKeys.value ? sorted(parsed.value.value) : parsed.value.value));

/** Structure readout — the numbers that tell you what you're holding. */
const stats = computed(() => {
  if (!valid.value) return null;
  let keys = 0;
  let nodes = 0;
  let depth = 0;
  const walk = (v: unknown, d: number) => {
    nodes++;
    depth = Math.max(depth, d);
    if (Array.isArray(v)) v.forEach((x) => walk(x, d + 1));
    else if (v && typeof v === "object") {
      for (const k of Object.keys(v as object)) {
        keys++;
        walk((v as Record<string, unknown>)[k], d + 1);
      }
    }
  };
  walk(parsed.value.value, 0);
  return { keys, nodes, depth, size: input.value.length };
});

const indentArg = computed(() => (indent.value === 0 ? "\t" : indent.value));

function format() {
  if (!valid.value) return;
  output.value = JSON.stringify(shaped.value, null, indentArg.value);
}

function minify() {
  if (!valid.value) return;
  output.value = JSON.stringify(shaped.value);
}

function escape() {
  if (!input.value) return;
  output.value = JSON.stringify(input.value);
}

function unescape() {
  if (!input.value) return;
  try {
    const v = JSON.parse(input.value.trim());
    output.value = typeof v === "string" ? v : JSON.stringify(v, null, indentArg.value);
  } catch (e) {
    toast((e as Error).message, "fail");
  }
}

function clearAll() {
  input.value = "";
  output.value = "";
  findText.value = "";
}

function useOutput() {
  input.value = output.value;
}

// ---------- find / replace ----------

function buildRegex(): RegExp | null {
  const term = findText.value;
  if (!term) return null;
  const flags = matchCase.value ? "g" : "gi";
  try {
    if (useRegex.value) return new RegExp(term, flags);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(wholeWord.value ? `\\b${escaped}\\b` : escaped, flags);
  } catch {
    return null;
  }
}

const hits = computed<{ index: number; length: number }[]>(() => {
  const re = buildRegex();
  if (!re || !input.value) return [];
  const out: { index: number; length: number }[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(input.value)) !== null) {
    out.push({ index: m.index, length: m[0].length });
    if (m[0] === "") re.lastIndex++;
    if (out.length >= 2000) break;
  }
  return out;
});

// Keep the cursor inside the result set as the query changes.
watch(hits, (list) => {
  if (hitIndex.value >= list.length) hitIndex.value = 0;
});

async function jump(delta: number) {
  const list = hits.value;
  if (!list.length) return;
  hitIndex.value = (hitIndex.value + delta + list.length) % list.length;
  const hit = list[hitIndex.value];
  await nextTick();
  const el = inputEl.value;
  if (!el) return;
  el.focus();
  el.setSelectionRange(hit.index, hit.index + hit.length);
  // Scroll the selection roughly into view — textareas have no scrollIntoView.
  const before = input.value.slice(0, hit.index).split("\n").length - 1;
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "18") || 18;
  el.scrollTop = Math.max(0, before * lineHeight - el.clientHeight / 2);
}

function replaceOne() {
  const list = hits.value;
  if (!list.length) return;
  const hit = list[Math.min(hitIndex.value, list.length - 1)];
  input.value =
    input.value.slice(0, hit.index) + replaceText.value + input.value.slice(hit.index + hit.length);
  toast(t("json.replacedOne"), "ok");
}

function replaceAll() {
  const re = buildRegex();
  if (!re) return;
  const n = hits.value.length;
  if (!n) return;
  input.value = input.value.replace(re, replaceText.value);
  toast(t("json.replacedAll", { n }), "ok");
}
</script>

<template>
  <ToolFrame tool-id="json-format" shape="flow">
    <template #notice>
      <div class="status banner" :class="valid ? 'ok' : parsed.error ? 'fail' : ''">
        <Icon :name="valid ? 'CircleCheck' : parsed.error ? 'CircleAlert' : 'Braces'" />
        <span v-if="valid" class="msg">{{ t("json.valid") }}</span>
        <span v-else-if="parsed.error" class="msg">
          {{ t("json.invalid") }}
          <template v-if="parsed.line">
            · {{ t("json.errorAt", { line: parsed.line, col: parsed.col }) }}
          </template>
          <span class="raw mono">{{ parsed.error }}</span>
        </span>
        <span v-else class="msg">{{ t("json.empty") }}</span>

        <template v-if="stats">
          <span class="badge">{{ t("json.keys") }} {{ stats.keys }}</span>
          <span class="badge">{{ t("json.nodes") }} {{ stats.nodes }}</span>
          <span class="badge">{{ t("json.depth") }} {{ stats.depth }}</span>
          <span class="badge">{{ t("json.size") }} {{ stats.size }}</span>
        </template>
      </div>
    </template>

    <div class="row">
      <button class="btn btn-sm btn-signal" :disabled="!valid" @click="format">
        <Icon name="Indent" /> {{ t("json.format") }}
      </button>
      <button class="btn btn-sm" :disabled="!valid" @click="minify">
        <Icon name="Minimize" /> {{ t("json.minify") }}
      </button>
      <button class="chip" :class="{ on: showFind }" @click="showFind = !showFind">
        <Icon name="Search" /> {{ t("json.find") }}
      </button>
      <button class="chip" :disabled="!input && !output" @click="clearAll">{{ t("common.clear") }}</button>
    </div>

    <div v-if="showFind" class="findbar card">
      <div class="findline">
        <Icon name="Search" />
        <input
          v-model="findText"
          class="input find mono"
          :placeholder="t('json.findPh')"
          spellcheck="false"
          @keydown.enter.prevent="jump(1)"
        />
        <span class="badge" :class="{ fail: findText && !hits.length }">
          {{ hits.length ? `${hitIndex + 1}/${hits.length}` : findText ? t("json.noHit") : "0" }}
        </span>
        <button class="btn btn-sm btn-icon btn-quiet" :disabled="!hits.length" @click="jump(-1)">
          <Icon name="ChevronUp" />
        </button>
        <button class="btn btn-sm btn-icon btn-quiet" :disabled="!hits.length" @click="jump(1)">
          <Icon name="ChevronDown" />
        </button>
      </div>
      <div class="findline">
        <Icon name="Replace" />
        <input
          v-model="replaceText"
          class="input find mono"
          :placeholder="t('json.replacePh')"
          spellcheck="false"
        />
        <button class="btn btn-sm" :disabled="!hits.length" @click="replaceOne">{{ t("json.replace") }}</button>
        <button class="btn btn-sm" :disabled="!hits.length" @click="replaceAll">{{ t("json.replaceAll") }}</button>
      </div>
      <div class="chips">
        <button class="chip" :class="{ on: matchCase }" @click="matchCase = !matchCase">
          {{ t("json.matchCase") }}
        </button>
        <button class="chip" :class="{ on: wholeWord }" :disabled="useRegex" @click="wholeWord = !wholeWord">
          {{ t("json.wholeWord") }}
        </button>
        <button class="chip" :class="{ on: useRegex }" @click="useRegex = !useRegex">
          {{ t("json.useRegex") }}
        </button>
      </div>
    </div>

    <div class="field grow-field">
      <span class="lab">{{ t("json.input") }}</span>
      <textarea
        ref="inputEl"
        v-model="input"
        class="textarea mono src"
        :class="{ bad: !!parsed.error }"
        :placeholder="t('json.inputPh')"
        spellcheck="false"
      ></textarea>
    </div>

    <template #result>
      <div class="res-head">
        <div class="seg viewseg">
          <button :class="{ on: view === 'tree' }" @click="view = 'tree'">{{ t("json.viewTree") }}</button>
          <button :class="{ on: view === 'text' }" @click="view = 'text'">{{ t("json.viewText") }}</button>
          <button :class="{ on: view === 'path' }" @click="view = 'path'">{{ t("json.viewPath") }}</button>
        </div>
        <span v-if="view === 'path' && valid && !pathResult.error" class="badge acc">
          {{ pathResult.matches.length }}
        </span>
        <button v-if="view === 'text' && output" class="btn btn-sm btn-quiet" @click="useOutput">
          <Icon name="ArrowLeft" /> {{ t("json.input") }}
        </button>
        <button
          v-if="view !== 'path'"
          class="btn btn-sm btn-quiet"
          :disabled="view === 'text' ? !output : !valid"
          @click="copyText(view === 'text' ? output : JSON.stringify(shaped, null, indentArg), t('common.copied'))"
        >
          <Icon name="Copy" /> {{ t("common.copy") }}
        </button>
        <button
          v-else
          class="btn btn-sm btn-quiet"
          :disabled="!pathResult.matches.length"
          @click="copyText(JSON.stringify(pathResult.matches.map((m) => m.value), null, indentArg), t('common.copied'))"
        >
          <Icon name="Copy" /> {{ t("json.copyMatches") }}
        </button>
      </div>

      <div v-if="view === 'tree'" class="pane scroll-y">
        <JsonTree v-if="valid" :value="shaped" />
        <span v-else class="hint">{{ t("json.empty") }}</span>
      </div>

      <!-- JSONPath -->
      <template v-else-if="view === 'path'">
        <div class="qbar">
          <Icon name="Search" />
          <input
            v-model="pathExpr"
            class="input mono qin"
            :class="{ bad: !!pathResult.error }"
            placeholder="$.store.book[?(@.price < 10)].title"
            spellcheck="false"
          />
        </div>
        <div class="pane scroll-y">
          <p v-if="!valid" class="hint">{{ t("json.empty") }}</p>
          <p v-else-if="pathResult.error" class="banner fail">{{ pathResult.error }}</p>
          <p v-else-if="!pathExpr.trim()" class="hint">{{ t("json.pathIdle") }}</p>
          <p v-else-if="!pathResult.matches.length" class="hint">{{ t("json.pathNone") }}</p>
          <!-- Location on top, value below: the location is what you copy into
               code, so it gets the readable line. -->
          <button
            v-for="m in pathResult.matches"
            :key="m.path"
            class="hit"
            :title="t('common.copy')"
            @click="copyText(typeof m.value === 'string' ? m.value : JSON.stringify(m.value), t('common.copied'))"
          >
            <code class="hpath mono">{{ m.path }}</code>
            <code class="hval mono">{{ preview(m.value) }}</code>
          </button>
        </div>
      </template>

      <textarea v-else :value="output" class="textarea mono flat" readonly spellcheck="false"></textarea>
    </template>

    <template #inspector>
      <InspectorSection :title="t('json.indent')" icon="Indent">
        <div class="seg">
          <button v-for="n in [2, 4]" :key="n" :class="{ on: indent === n }" @click="indent = n">{{ n }}</button>
          <button :class="{ on: indent === 0 }" @click="indent = 0">Tab</button>
        </div>
        <button class="chip" :class="{ on: sortKeys }" @click="sortKeys = !sortKeys">
          {{ t("json.sortKeys") }}
        </button>
      </InspectorSection>

      <InspectorSection :title="t('json.escape')" icon="Braces">
        <button class="btn btn-sm" :disabled="!input" @click="escape">{{ t("json.escape") }}</button>
        <button class="btn btn-sm" :disabled="!input" @click="unescape">{{ t("json.unescape") }}</button>
      </InspectorSection>

      <InspectorSection v-if="view === 'path'" :title="t('json.pathSyntax')" icon="Route">
        <div class="reflist">
          <button v-for="e in PATH_EXAMPLES" :key="e" class="ref" @click="pathExpr = e">
            <code class="mono">{{ e }}</code>
          </button>
        </div>
        <p class="hint">{{ t("json.pathHint") }}</p>
      </InspectorSection>

      <InspectorSection :title="t('json.sample')" icon="FileJson">
        <button class="chip" @click="input = SIMPLE_SAMPLE">{{ t("json.sampleSimple") }}</button>
        <button class="chip" @click="input = COMPLEX_SAMPLE">{{ t("json.sampleComplex") }}</button>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
.status {
  flex-wrap: wrap;
}

.msg {
  flex: 1;
  min-width: 0;
}

.raw {
  display: block;
  font-size: var(--t-xs);
  opacity: 0.85;
  word-break: break-word;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.findbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.findline {
  display: flex;
  align-items: center;
  gap: 8px;
}

.findline :deep(svg) {
  width: 14px;
  height: 14px;
  color: var(--ink-3);
  flex-shrink: 0;
}

.find {
  flex: 1;
  min-width: 0;
}

.chips {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.grow-field {
  flex: 1;
  min-height: 0;
}

.src {
  flex: 1;
  min-height: 260px;
}

.textarea.bad {
  border-color: var(--fail);
}

.res-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.viewseg {
  width: 230px;
}

.res-head .btn:first-of-type {
  margin-left: auto;
}

.pane {
  flex: 1;
  padding: 12px 14px;
  user-select: text;
}

.flat {
  flex: 1;
  border: 0;
  border-radius: 0;
  background: transparent;
  min-height: 0;
  resize: none;
}

/* ---- JSONPath ---- */

.qbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.qbar :deep(svg) {
  width: 13px;
  height: 13px;
  color: var(--ink-3);
  flex-shrink: 0;
}

.qin {
  flex: 1;
  min-width: 0;
}

.qin.bad {
  border-color: var(--fail);
}

.hit {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 7px 10px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.hit:hover {
  border-color: var(--acc-line);
  background: var(--acc-wash);
}

/* The location is the thing you paste into code, so it reads first and in
   the accent colour; the value is context. */
.hpath {
  font-size: var(--t-xs);
  color: var(--acc);
  word-break: break-all;
}

.hval {
  font-size: var(--t-sm);
  color: var(--ink);
  word-break: break-all;
}

.reflist {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ref {
  padding: 6px 9px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.ref:hover {
  border-color: var(--acc-line);
  background: var(--acc-wash);
}

.ref code {
  font-size: var(--t-xs);
  color: var(--ink-2);
  word-break: break-all;
}
</style>
