<script setup lang="ts">
/**
 * Regex tester running on the webview's own JavaScript engine, so lookaround,
 * named groups and backreferences all behave exactly as they will in the
 * user's JS/PCRE-style target — which Go's RE2 cannot express.
 */
import { computed, onMounted, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText, toast } from "../../stores/toast";
import { FLAG_DESC, explain } from "../../lib/regexExplain";
import { replaceAll } from "../../lib/regexReplace";
import {
  BUILTIN_PATTERNS,
  PATTERN_GROUPS,
  SAMPLE_TEXT,
  addSnippet,
  categoriesOf,
  emptySnippet,
  loadSnippets,
  removeSnippet,
  snippets,
  updateSnippet,
  type Snippet,
  type SnippetInput,
} from "../../lib/snippets";

const pattern = ref("");
const text = ref("");
const flagG = ref(true);
const flagI = ref(false);
const flagM = ref(false);
const flagS = ref(false);
const flagU = ref(false);
const flagY = ref(false);

const activeGroup = ref<string>("common");
const showExplain = ref(false);

// snippet library state
const snipQuery = ref("");
const snipCategory = ref("");
const formOpen = ref(false);
const editingId = ref("");
const form = ref<SnippetInput>(emptySnippet());

onMounted(loadSnippets);

const flags = computed(
  () =>
    (flagG.value ? "g" : "") +
    (flagI.value ? "i" : "") +
    (flagM.value ? "m" : "") +
    (flagS.value ? "s" : "") +
    (flagU.value ? "u" : "") +
    (flagY.value ? "y" : ""),
);

interface Match {
  full: string;
  index: number;
  groups: string[];
  named: Record<string, string>;
}

const compiled = computed<{ re: RegExp | null; error: string }>(() => {
  if (!pattern.value) return { re: null, error: "" };
  try {
    return { re: new RegExp(pattern.value, flags.value), error: "" };
  } catch (e) {
    return { re: null, error: (e as Error).message };
  }
});

const result = computed<{ matches: Match[]; error: string }>(() => {
  const { re, error } = compiled.value;
  if (error) return { matches: [], error };
  if (!re || !text.value) return { matches: [], error: "" };

  const out: Match[] = [];
  const LIMIT = 500;

  if (re.global) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text.value)) !== null) {
      out.push({
        full: m[0],
        index: m.index,
        groups: m.slice(1).map((g) => g ?? ""),
        named: { ...(m.groups ?? {}) },
      });
      // A zero-length match would loop forever without nudging lastIndex.
      if (m[0] === "") re.lastIndex++;
      if (out.length >= LIMIT) break;
    }
  } else {
    const m = re.exec(text.value);
    if (m) {
      out.push({
        full: m[0],
        index: m.index,
        groups: m.slice(1).map((g) => g ?? ""),
        named: { ...(m.groups ?? {}) },
      });
    }
  }
  return { matches: out, error: "" };
});

/** Split the subject into plain/matched runs so we can mark hits inline.
 *  Hits remember their match index so the table can scroll one into view. */
const segments = computed<{ text: string; hit: boolean; mi?: number }[]>(() => {
  const parts: { text: string; hit: boolean; mi?: number }[] = [];
  const matches = result.value.matches;
  if (!text.value) return parts;
  if (!matches.length) return [{ text: text.value, hit: false }];

  let cursor = 0;
  for (const m of matches) {
    if (m.index > cursor) parts.push({ text: text.value.slice(cursor, m.index), hit: false });
    if (m.full) parts.push({ text: m.full, hit: true, mi: m.index });
    cursor = m.index + m.full.length;
  }
  if (cursor < text.value.length) parts.push({ text: text.value.slice(cursor), hit: false });
  return parts;
});

// Replacement preview. Kept as a separate view of the same match set rather
// than a separate tool: what you want to know is whether *this* pattern
// rewrites the text the way you meant, and that question only makes sense
// next to the matches.
const replacement = ref("");
const resultView = ref<"match" | "replace">("match");

const replaced = computed(() =>
  replaceAll(text.value, compiled.value.error ? null : compiled.value.re, replacement.value),
);

const tokens = computed(() => (pattern.value ? explain(pattern.value) : []));
const activeFlags = computed(() => flags.value.split("").map((f) => ({ f, desc: FLAG_DESC[f] })));

const groupedBuiltins = computed(() =>
  BUILTIN_PATTERNS.filter((p) => p.group === activeGroup.value),
);

// ---------- snippet library ----------

const snipCategories = computed(() => categoriesOf(snippets.value));

const visibleSnippets = computed(() => {
  const q = snipQuery.value.trim().toLowerCase();
  return snippets.value.filter((s) => {
    if (snipCategory.value && s.category !== snipCategory.value) return false;
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.pattern.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  });
});

function usePattern(p: string, f: string) {
  pattern.value = p;
  flagG.value = f.includes("g");
  flagI.value = f.includes("i");
  flagM.value = f.includes("m");
  flagS.value = f.includes("s");
  flagU.value = f.includes("u");
  flagY.value = f.includes("y");
}

/** The match table as JSON — scraping pipelines want positions and groups,
 *  not just the matched strings the plain copy gives. */
function copyMatchesJson() {
  const data = result.value.matches.map((m) => ({
    index: m.index,
    match: m.full,
    ...(m.groups.length ? { groups: m.groups } : {}),
    ...(Object.keys(m.named).length ? { named: m.named } : {}),
  }));
  copyText(JSON.stringify(data, null, 2), t("common.copied"));
}

// Clicking a table row scrolls the highlighted preview to that match and
// rings it briefly — with hundreds of hits, "which one is #37" needs an answer.
const previewEl = ref<HTMLElement | null>(null);
const activeMatch = ref(-1);
let flashTimer = 0;

function locate(m: Match) {
  if (!m.full) return;
  activeMatch.value = m.index;
  previewEl.value?.querySelector(`#mx${m.index}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => (activeMatch.value = -1), 1200);
}

function applySnippet(s: Snippet) {
  usePattern(s.pattern, s.flags);
  if (s.sampleText) text.value = s.sampleText;
}

function openCreate() {
  editingId.value = "";
  form.value = { ...emptySnippet(), pattern: pattern.value, flags: flags.value, sampleText: text.value };
  formOpen.value = true;
}

function openEdit(s: Snippet) {
  editingId.value = s.id;
  form.value = { ...s };
  formOpen.value = true;
}

async function submitForm() {
  const f = form.value;
  if (!f.name.trim() || !f.pattern.trim()) {
    toast(t("regex.needNamePattern"), "fail");
    return;
  }
  // Reject a pattern that can't compile — a broken snippet is worse than none.
  try {
    new RegExp(f.pattern, f.flags);
  } catch (e) {
    toast(`${t("regex.invalid")}: ${(e as Error).message}`, "fail");
    return;
  }
  if (editingId.value) {
    await updateSnippet(editingId.value, f);
    toast(t("regex.snippetUpdated"), "ok");
  } else {
    await addSnippet(f);
    toast(t("regex.snippetSaved"), "ok");
  }
  formOpen.value = false;
  editingId.value = "";
}

async function del(s: Snippet) {
  await removeSnippet(s.id);
  toast(t("regex.snippetDeleted"), "ok");
}
</script>

<template>
  <ToolFrame tool-id="regex-test" shape="flow">
    <!-- Main pane: pattern, subject. Everything secondary lives in the
         inspector, so the work area stays two bands deep instead of twelve. -->
    <div class="field">
      <span class="lab">{{ t("regex.pattern") }}</span>
      <div class="patline" :class="{ bad: !!result.error }">
        <span class="slash">/</span>
        <input
          v-model="pattern"
          class="patin mono"
          :placeholder="t('regex.patternPh')"
          spellcheck="false"
          autocomplete="off"
        />
        <span class="slash">/</span>
        <div class="flags">
          <button class="fl" :class="{ on: flagG }" :title="FLAG_DESC.g" @click="flagG = !flagG">g</button>
          <button class="fl" :class="{ on: flagI }" :title="FLAG_DESC.i" @click="flagI = !flagI">i</button>
          <button class="fl" :class="{ on: flagM }" :title="FLAG_DESC.m" @click="flagM = !flagM">m</button>
          <button class="fl" :class="{ on: flagS }" :title="FLAG_DESC.s" @click="flagS = !flagS">s</button>
          <button class="fl" :class="{ on: flagU }" :title="FLAG_DESC.u" @click="flagU = !flagU">u</button>
          <button class="fl" :class="{ on: flagY }" :title="FLAG_DESC.y" @click="flagY = !flagY">y</button>
        </div>
      </div>
      <p v-if="result.error" class="err mono">{{ result.error }}</p>
      <p v-else class="hint">{{ t("regex.engineNote") }}</p>
    </div>

    <div v-if="resultView === 'replace'" class="field">
      <span class="lab">{{ t("regex.replaceWith") }}</span>
      <input
        v-model="replacement"
        class="input mono"
        :placeholder="t('regex.replacePh')"
        spellcheck="false"
        autocomplete="off"
      />
      <p class="hint">{{ t("regex.replaceHint") }}</p>
    </div>

    <div class="row">
      <button class="chip" @click="text = SAMPLE_TEXT">{{ t("regex.loadSample") }}</button>
      <button class="chip" :disabled="!pattern" @click="copyText(`/${pattern}/${flags}`, t('common.copied'))">
        <Icon name="Copy" /> {{ t("regex.copyPattern") }}
      </button>
      <button class="chip" :disabled="!pattern && !text" @click="pattern = ''; text = ''">
        {{ t("common.clear") }}
      </button>
      <button class="chip" :disabled="!pattern" @click="openCreate">
        <Icon name="BookMarked" /> {{ t("regex.save") }}
      </button>
    </div>

    <div class="field grow-field">
      <span class="lab">{{ t("regex.text") }}</span>
      <textarea
        v-model="text"
        class="textarea mono subject"
        :placeholder="t('regex.textPh')"
        spellcheck="false"
      ></textarea>
    </div>

    <!-- Result pane: highlight above, capture-group table below. -->
    <template #result>
      <div class="res-head">
        <div class="seg resseg">
          <button :class="{ on: resultView === 'match' }" @click="resultView = 'match'">
            {{ t("regex.highlight") }}
          </button>
          <button :class="{ on: resultView === 'replace' }" @click="resultView = 'replace'">
            {{ t("regex.replace") }}
          </button>
        </div>
        <span class="badge" :class="{ acc: result.matches.length }">
          {{ result.matches.length ? t("regex.matchCount", { n: result.matches.length }) : t("regex.noMatch") }}
        </span>
        <div class="res-acts">
          <button
            v-if="resultView === 'match' && result.matches.length"
            class="btn btn-sm btn-quiet"
            @click="copyText(result.matches.map((m) => m.full).join('\n'), t('common.copied'))"
          >
            <Icon name="Copy" /> {{ t("regex.copyMatches") }}
          </button>
          <button
            v-if="resultView === 'match' && result.matches.length"
            class="btn btn-sm btn-quiet"
            @click="copyMatchesJson"
          >
            <Icon name="Copy" /> {{ t("regex.copyJson") }}
          </button>
          <button
            v-if="resultView === 'replace'"
            class="btn btn-sm btn-quiet"
            :disabled="!text"
            @click="copyText(replaced.output, t('common.copied'))"
          >
            <Icon name="Copy" /> {{ t("regex.copyResult") }}
          </button>
        </div>
      </div>

      <!-- Replaced text, with the substituted runs marked so it is obvious
           which parts the pattern actually touched. -->
      <div v-if="resultView === 'replace'" class="preview full mono scroll-y">
        <template v-if="replaced.segments.length">
          <span v-for="(s, i) in replaced.segments" :key="i" :class="{ sub: s.hit }">{{ s.text }}</span>
        </template>
        <span v-else class="hint">{{ t("regex.empty") }}</span>
      </div>

      <div v-else ref="previewEl" class="preview mono scroll-y">
        <template v-if="segments.length">
          <span
            v-for="(s, i) in segments"
            :key="i"
            :id="s.mi !== undefined ? `mx${s.mi}` : undefined"
            :class="{ hit: s.hit, flash: s.mi === activeMatch }"
            >{{ s.text }}</span
          >
        </template>
        <span v-else class="hint">{{ t("regex.empty") }}</span>
      </div>

      <div v-if="resultView === 'match' && result.matches.length" class="table-wrap scroll-y">
        <div class="tr th">
          <span>#</span>
          <span>{{ t("regex.index") }}</span>
          <span>{{ t("regex.matches") }}</span>
          <span>{{ t("regex.groups") }}</span>
        </div>
        <div v-for="(m, i) in result.matches.slice(0, 100)" :key="i" class="tr clickable" :title="t('regex.locate')" @click="locate(m)">
          <span class="mono">{{ i + 1 }}</span>
          <span class="mono">{{ m.index }}</span>
          <span class="mono c-full">{{ m.full }}</span>
          <span class="c-grp">
            <span v-for="(g, gi) in m.groups" :key="gi" class="grp mono"><b>{{ gi + 1 }}</b>{{ g }}</span>
            <span v-for="(v, k) in m.named" :key="k" class="grp named mono"><b>{{ k }}</b>{{ v }}</span>
            <span v-if="!m.groups.length && !Object.keys(m.named).length" class="hint">—</span>
          </span>
        </div>
        <p v-if="result.matches.length > 100" class="hint pad">
          {{ t("regex.tableTruncated", { n: result.matches.length }) }}
        </p>
      </div>
    </template>

    <!-- Inspector: library, snippets, structure -->
    <template #inspector>
      <InspectorSection :title="t('regex.library')" icon="Library">
        <div class="seg groupseg">
          <button
            v-for="g in PATTERN_GROUPS"
            :key="g"
            :class="{ on: activeGroup === g }"
            @click="activeGroup = g"
          >
            {{ t(`regex.group_${g}`) }}
          </button>
        </div>
        <div class="chips">
          <button
            v-for="p in groupedBuiltins"
            :key="p.label"
            class="chip"
            :title="p.pattern"
            @click="usePattern(p.pattern, p.flags)"
          >
            {{ p.label }}
          </button>
        </div>
      </InspectorSection>

      <InspectorSection
        :title="t('regex.custom')"
        icon="BookMarked"
        :count="snippets.length"
      >
        <div v-if="snippets.length" class="searchline">
          <Icon name="Search" />
          <input v-model="snipQuery" class="input" :placeholder="t('regex.searchSnippet')" />
        </div>
        <div v-if="snipCategories.length" class="chips">
          <button class="chip" :class="{ on: !snipCategory }" @click="snipCategory = ''">
            {{ t("regex.allCategories") }}
          </button>
          <button
            v-for="c in snipCategories"
            :key="c"
            class="chip"
            :class="{ on: snipCategory === c }"
            @click="snipCategory = c"
          >
            {{ c }}
          </button>
        </div>

        <div v-if="visibleSnippets.length" class="sniplist">
          <div v-for="s in visibleSnippets" :key="s.id" class="snipcard">
            <button class="snip-main" @click="applySnippet(s)">
              <span class="snip-name">{{ s.name }}</span>
              <code class="snip-pat mono">/{{ s.pattern }}/{{ s.flags }}</code>
              <span v-if="s.description" class="snip-desc">{{ s.description }}</span>
            </button>
            <div class="snip-acts">
              <button :title="t('regex.edit')" @click.stop="openEdit(s)"><Icon name="Pencil" /></button>
              <button class="danger" :title="t('regex.delete')" @click.stop="del(s)">
                <Icon name="Trash2" />
              </button>
            </div>
          </div>
        </div>
        <p v-else-if="snippets.length" class="hint">{{ t("regex.noSnippetHit") }}</p>
        <p v-else class="hint">{{ t("regex.noSnippetYet") }}</p>
      </InspectorSection>

      <InspectorSection :title="t('regex.explain')" icon="ListTree" :open="false">
        <div v-if="tokens.length" class="tok-list">
          <div v-for="(tk, i) in tokens" :key="i" class="tok">
            <code class="tok-text mono">{{ tk.text }}</code>
            <span class="tok-kind">{{ tk.kind }}</span>
            <span class="tok-desc">{{ tk.desc }}</span>
          </div>
          <div v-for="fl in activeFlags" :key="fl.f" class="tok flagrow">
            <code class="tok-text mono">{{ fl.f }}</code>
            <span class="tok-desc">{{ fl.desc }}</span>
          </div>
        </div>
        <p v-else class="hint">{{ t("regex.empty") }}</p>
      </InspectorSection>
    </template>

    <!-- Snippet editor drops in as an overlay card so it never pushes the
         work area around. -->
    <template v-if="formOpen" #notice>
      <div class="card form">
        <div class="form-grid">
          <label class="field">
            <span class="lab">{{ t("regex.saveName") }}</span>
            <input v-model="form.name" class="input" />
          </label>
          <label class="field">
            <span class="lab">{{ t("regex.category") }}</span>
            <input v-model="form.category" class="input" :placeholder="t('regex.categoryPh')" list="snip-cats" />
            <datalist id="snip-cats">
              <option v-for="c in snipCategories" :key="c" :value="c" />
            </datalist>
          </label>
          <label class="field">
            <span class="lab">{{ t("regex.flags") }}</span>
            <input v-model="form.flags" class="input mono" placeholder="gim" />
          </label>
          <label class="field span2">
            <span class="lab">{{ t("regex.pattern") }}</span>
            <input v-model="form.pattern" class="input mono" spellcheck="false" />
          </label>
          <label class="field">
            <span class="lab">{{ t("regex.description") }}</span>
            <input v-model="form.description" class="input" :placeholder="t('regex.descriptionPh')" />
          </label>
        </div>
        <div class="row">
          <button class="btn btn-sm btn-signal" @click="submitForm">
            <Icon name="Save" /> {{ t("common.save") }}
          </button>
          <button class="btn btn-sm btn-quiet" @click="formOpen = false">{{ t("common.cancel") }}</button>
        </div>
      </div>
    </template>
  </ToolFrame>
</template>

<style scoped>
/* Formula line: the pattern sits between literal slashes like it would in code. */
.patline {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 40px;
  padding: 0 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r);
  background: var(--s-1);
}

.patline:focus-within {
  border-color: var(--acc);
  box-shadow: var(--focus-ring);
}

.patline.bad {
  border-color: var(--fail);
}

.slash {
  font-family: var(--f-mono);
  font-size: var(--t-lg);
  color: var(--ink-4);
}

.patin {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  outline: none;
  color: var(--ink);
  font-size: var(--t-md);
}

.flags {
  display: flex;
  gap: 3px;
}

.fl {
  width: 24px;
  height: 24px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--s-2);
  color: var(--ink-3);
  font-family: var(--f-mono);
  font-size: var(--t-sm);
  cursor: pointer;
}

.fl.on {
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

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.grow-field {
  flex: 1;
  min-height: 0;
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

.res-head .btn {
  margin-left: auto;
}

.res-acts {
  margin-left: auto;
  display: flex;
  gap: 6px;
}

.res-acts .btn {
  margin-left: 0;
}

.resseg {
  width: 170px;
  flex-shrink: 0;
}

.preview {
  flex: 0 0 auto;
  max-height: 42%;
  padding: 12px 14px;
  font-size: var(--t-sm);
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
  border-bottom: 1px solid var(--line);
}

/* With no capture-group table beneath it, the replaced text is the whole
   result — capping it at 42% would leave a dead band and a stray rule. */
.preview.full {
  flex: 1 1 auto;
  max-height: none;
  border-bottom: 0;
}

.preview .hit {
  background: var(--acc-wash-2);
  color: var(--acc);
  border-radius: 3px;
  padding: 0 1px;
  font-weight: 600;
}

/* The row-click target ring; box-shadow so the flash never reflows text. */
.preview .flash {
  box-shadow: 0 0 0 2px var(--acc);
  border-radius: 4px;
}

/* Substituted text uses the success colour rather than the accent: in the
   replace view the marked runs are what the pattern *produced*, not what it
   matched, and reusing the match colour reads as "these still match". */
.preview .sub {
  background: var(--ok-wash, var(--acc-wash-2));
  color: var(--ok, var(--acc));
  border-radius: 3px;
  padding: 0 1px;
  font-weight: 600;
}

.table-wrap {
  flex: 1;
  min-height: 0;
}

.tr {
  display: grid;
  grid-template-columns: 40px 58px minmax(120px, 1fr) minmax(140px, 1.3fr);
  gap: 10px;
  padding: 7px 14px;
  border-bottom: 1px solid var(--line-2);
  font-size: var(--t-sm);
  align-items: baseline;
}

.tr.th {
  position: sticky;
  top: 0;
  background: var(--s-3);
  color: var(--ink-3);
  font-size: var(--t-xs);
  font-weight: 600;
}

.tr.clickable {
  cursor: pointer;
}

.tr.clickable:hover {
  background: var(--s-2);
}

.c-full {
  word-break: break-all;
  user-select: text;
}

.c-grp {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.grp {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 1px 7px;
  border-radius: var(--r-pill);
  background: var(--s-3);
  font-size: var(--t-xs);
  user-select: text;
}

.grp b {
  color: var(--ink-3);
  font-weight: 600;
}

.grp.named b {
  color: var(--acc);
}

.pad {
  padding: 8px 14px;
}

/* inspector bits */
.groupseg {
  width: 100%;
}

.searchline {
  display: flex;
  align-items: center;
  gap: 7px;
}

.searchline :deep(svg) {
  width: 14px;
  height: 14px;
  color: var(--ink-3);
  flex-shrink: 0;
}

.sniplist {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.snipcard {
  display: flex;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-1);
  overflow: hidden;
}

.snip-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: var(--f-ui);
}

.snip-main:hover {
  background: var(--s-2);
}

.snip-name {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--ink);
}

.snip-pat,
.snip-desc {
  font-size: var(--t-xs);
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.snip-acts {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--line);
}

.snip-acts button {
  flex: 1;
  width: 28px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
}

.snip-acts button:hover {
  background: var(--s-3);
  color: var(--ink);
}

.snip-acts button.danger:hover {
  background: var(--fail-wash);
  color: var(--fail);
}

.snip-acts :deep(svg) {
  width: 13px;
  height: 13px;
}

.tok-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tok {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: var(--t-xs);
  flex-wrap: wrap;
}

.tok-text {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: var(--r-sm);
  background: var(--s-3);
  color: var(--ink);
  word-break: break-all;
}

.tok-kind {
  flex-shrink: 0;
  color: var(--acc);
  font-weight: 600;
}

.tok-desc {
  color: var(--ink-2);
  flex: 1;
  min-width: 0;
}

.flagrow {
  padding-top: 5px;
  border-top: 1px solid var(--line);
}

/* snippet editor */
.form {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.form-grid .span2 {
  grid-column: span 2;
}

@media (max-width: 760px) {
  .form-grid .span2 {
    grid-column: auto;
  }
}
</style>
