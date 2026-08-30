<script setup lang="ts">
/**
 * Line-level diff of two pasted documents. Exact LCS rather than a heuristic,
 * because a mis-aligned block is worse than a slow one at these sizes.
 */
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText, toast } from "../../stores/toast";
import { errText } from "../../lib/err";
import {
  inWails,
  outputDir,
  pickFiles,
  readFileBytes,
  formatBytes,
  writeFileChunked,
} from "../../lib/backend";
import { onFilesDropped, dragActive } from "../../lib/drop";
import { decodeText, MAX_TEXT_BYTES, type DecodedText } from "../../lib/textfile";
import {
  diffLines,
  rowPieces,
  splitLines,
  toHtml,
  toUnified,
  type Collapsed,
} from "../../lib/diff";
import type { FileInfo } from "@bindings/hitool/services/models";

const left = ref("");
const right = ref("");
const ignoreCase = ref(false);
const ignoreWhitespace = ref(false);
const ignoreDigits = ref(false);
const collapse = ref(true);
const word = ref(true);

const result = computed(() =>
  diffLines(left.value, right.value, {
    ignoreCase: ignoreCase.value,
    ignoreWhitespace: ignoreWhitespace.value,
    ignoreDigits: ignoreDigits.value,
    context: collapse.value ? 3 : 0,
    word: word.value,
  }),
);

// ---------- export ----------

/** File names when two files were loaded; the generic a/b otherwise. */
const names = computed(() => ({
  leftName: meta.value.left?.name || "a",
  rightName: meta.value.right?.name || "b",
}));

/**
 * Whether an export would produce anything — the same question `toUnified`
 * answers by returning "", but without running a second LCS. Reading `unified`
 * to disable a button would rebuild the whole diff on every render, doubling
 * the cost of every keystroke; this reads counters the visible diff already
 * produced. A row is either same, add or del, so a non-zero total means at
 * least one line differs, which is exactly toUnified's own emptiness test.
 */
const hasChanges = computed(() => result.value.added + result.value.removed > 0);

/** Lazy on purpose: only the copy and export handlers may read this. */
const unified = computed(() =>
  toUnified(left.value, right.value, {
    ignoreCase: ignoreCase.value,
    ignoreWhitespace: ignoreWhitespace.value,
    ignoreDigits: ignoreDigits.value,
    context: collapse.value ? 3 : 0,
    ...names.value,
  }),
);

const exporting = ref(false);

async function save(kind: "diff" | "html") {
  if (exporting.value || !result.value.rows.length) return;
  if (!inWails()) {
    toast(t("diff.exportDesktopOnly"), "fail");
    return;
  }
  exporting.value = true;
  try {
    const body =
      kind === "diff" ? unified.value : toHtml(result.value, names.value);
    if (!body) {
      toast(t("diff.nothingToExport"), "fail");
      return;
    }
    const dir = await outputDir("Diff");
    const stem = (meta.value.left?.name || "diff").replace(/\.[^.]+$/, "");
    const name = `${stem}.${kind}`;
    await writeFileChunked(`${dir}/${name}`, new TextEncoder().encode(body));
    toast(t("diff.exported", { path: name }), "ok");
  } catch (e) {
    toast(errText(e), "fail");
  } finally {
    exporting.value = false;
  }
}

const identical = computed(
  () => !!left.value && !!right.value && result.value.added === 0 && result.value.removed === 0,
);

const sign = (r: Collapsed) => (r.kind === "add" ? "+" : r.kind === "del" ? "−" : " ");

// ---------- loading files ----------

type Side = "left" | "right";
interface Loaded extends Pick<DecodedText, "encoding" | "eol"> {
  name: string;
}

const meta = ref<Record<Side, Loaded | undefined>>({ left: undefined, right: undefined });

const eolDiffer = computed(() => {
  const l = meta.value.left?.eol;
  const r = meta.value.right?.eol;
  return !!l && !!r && l !== r;
});

async function load(f: FileInfo, side: Side) {
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
    (side === "left" ? left : right).value = d.text;
    meta.value = { ...meta.value, [side]: { name: f.name, encoding: d.encoding, eol: d.eol } };
  } catch (e) {
    toast(errText(e), "fail");
  }
}

/**
 * Two files at once means "compare these two" no matter where they landed —
 * that is the whole gesture, and asking the user to aim twice would be worse.
 * A single file goes where it was dropped, or to the empty side.
 */
onFilesDropped((dropped, zone) => {
  if (dropped.length >= 2) {
    load(dropped[0], "left");
    load(dropped[1], "right");
    return;
  }
  const side: Side =
    zone === "diff-right" ? "right" : zone === "diff-left" ? "left" : left.value ? "right" : "left";
  load(dropped[0], side);
});

async function choose(side: Side) {
  const paths = await pickFiles(t("common.selectFiles"), "Text", [], false);
  if (!paths.length) return;
  const { StatFiles } = await import("@bindings/hitool/services/systemservice");
  const stat = (await StatFiles(paths)) ?? [];
  if (stat.length) load(stat[0], side);
}

/** Typed-in text is no longer the file that was loaded. */
function touched(side: Side) {
  if (meta.value[side]) meta.value = { ...meta.value, [side]: undefined };
}

function clearAll() {
  left.value = "";
  right.value = "";
  meta.value = { left: undefined, right: undefined };
}

function swap() {
  const a = left.value;
  left.value = right.value;
  right.value = a;
  meta.value = { left: meta.value.right, right: meta.value.left };
}
</script>

<template>
  <ToolFrame tool-id="text-diff" shape="flow">
    <div class="pair">
      <div
        v-for="side in (['left', 'right'] as const)"
        :key="side"
        class="field side"
        :class="{ hot: dragActive }"
        :data-file-drop-target="`diff-${side}`"
      >
        <div class="head">
          <span class="lab">{{ t(`diff.${side}`) }}</span>
          <!-- splitLines, not split("\n"): a file's final newline terminates
               its last line rather than starting an empty one. -->
          <span v-if="(side === 'left' ? left : right)" class="badge">
            {{ splitLines(side === "left" ? left : right).length }}
          </span>
          <span v-if="meta[side]" class="fname truncate" :title="meta[side]!.name">
            {{ meta[side]!.name }}
          </span>
          <span v-if="meta[side] && meta[side]!.encoding !== 'utf-8'" class="badge warn">
            {{ meta[side]!.encoding.toUpperCase() }}
          </span>
          <span v-if="meta[side] && meta[side]!.eol !== 'lf' && meta[side]!.eol !== 'none'" class="badge">
            {{ meta[side]!.eol.toUpperCase() }}
          </span>
          <button class="mini" :title="t('diff.openFile')" @click="choose(side)">
            <Icon name="FolderOpen" />
          </button>
        </div>
        <textarea
          v-if="side === 'left'"
          v-model="left"
          class="textarea mono src"
          :placeholder="t('diff.leftPh')"
          spellcheck="false"
          @input="touched('left')"
        ></textarea>
        <textarea
          v-else
          v-model="right"
          class="textarea mono src"
          :placeholder="t('diff.rightPh')"
          spellcheck="false"
          @input="touched('right')"
        ></textarea>
      </div>
    </div>

    <div class="row">
      <button class="btn btn-sm" :disabled="!left && !right" @click="swap">
        <Icon name="ArrowLeftRight" /> {{ t("diff.swap") }}
      </button>
      <button class="btn btn-sm btn-quiet" :disabled="!left && !right" @click="clearAll">
        {{ t("common.clear") }}
      </button>
      <span class="hint drophint">{{ t("diff.dropHint") }}</span>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("diff.result") }}</span>
        <span v-if="result.added" class="badge ok">+{{ result.added }}</span>
        <span v-if="result.removed" class="badge fail">−{{ result.removed }}</span>
        <span v-if="identical" class="badge ok">{{ t("diff.identical") }}</span>
        <!-- Endings are normalised before comparing, so "identical" would
             otherwise hide the one difference that is actually there. -->
        <span v-if="eolDiffer" class="badge warn">
          {{ meta.left!.eol.toUpperCase() }} → {{ meta.right!.eol.toUpperCase() }}
        </span>
        <button
          class="btn btn-sm btn-quiet"
          :disabled="!hasChanges"
          :title="t('diff.copyUnified')"
          @click="copyText(unified, t('common.copied'))"
        >
          <Icon name="Copy" />
        </button>
      </div>

      <div class="rows scroll-y mono">
        <template v-if="result.rows.length">
          <div v-for="(r, i) in result.rows" :key="i" class="drow" :class="r.kind">
            <template v-if="r.skipped">
              <span class="skip">⋯ {{ t("diff.skipped", { n: r.skipped }) }}</span>
            </template>
            <template v-else>
              <span class="no">{{ r.leftNo ?? "" }}</span>
              <span class="no">{{ r.rightNo ?? "" }}</span>
              <span class="sign">{{ sign(r) }}</span>
              <span v-if="r.parts" class="text">
                <span v-for="(p, k) in rowPieces(r)" :key="k" :class="{ mark: p.changed }">{{
                  p.text
                }}</span>
              </span>
              <span v-else class="text">{{ r.text || " " }}</span>
            </template>
          </div>
        </template>
        <p v-else class="hint pad">{{ t("diff.idle") }}</p>
      </div>

      <p v-if="result.truncated" class="banner warn trunc">{{ t("diff.truncated") }}</p>
    </template>

    <template #inspector>
      <InspectorSection :title="t('diff.options')" icon="Settings2">
        <button class="chip" :class="{ on: ignoreCase }" @click="ignoreCase = !ignoreCase">
          {{ t("diff.ignoreCase") }}
        </button>
        <button
          class="chip"
          :class="{ on: ignoreWhitespace }"
          @click="ignoreWhitespace = !ignoreWhitespace"
        >
          {{ t("diff.ignoreWs") }}
        </button>
        <button class="chip" :class="{ on: ignoreDigits }" @click="ignoreDigits = !ignoreDigits">
          {{ t("diff.ignoreDigits") }}
        </button>
        <button class="chip" :class="{ on: collapse }" @click="collapse = !collapse">
          {{ t("diff.collapse") }}
        </button>
        <button class="chip" :class="{ on: word }" @click="word = !word">
          {{ t("diff.word") }}
        </button>
        <p class="hint">{{ t("diff.collapseHint") }}</p>
        <p class="hint">{{ t("diff.wordHint") }}</p>
      </InspectorSection>

      <InspectorSection :title="t('diff.export')" icon="Download">
        <div class="exports">
          <button class="btn btn-sm" :disabled="!hasChanges || exporting" @click="save('diff')">
            <Icon name="FileCode2" /> {{ t("diff.exportDiff") }}
          </button>
          <button
            class="btn btn-sm"
            :disabled="!result.rows.length || exporting"
            @click="save('html')"
          >
            <Icon name="FileText" /> {{ t("diff.exportHtml") }}
          </button>
        </div>
        <p class="hint">{{ t("diff.exportHint") }}</p>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.side {
  min-width: 0;
  border-radius: var(--r);
  transition: box-shadow 0.14s;
}

/* Both panes light up while a drag is in flight: which one takes the file is
   decided by where it lands, so neither can be singled out beforehand. */
.side.hot {
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

.head .mini {
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
  flex-shrink: 0;
}

.head .mini:hover {
  background: var(--s-3);
  color: var(--ink);
}

.head .mini :deep(svg) {
  width: 13px;
  height: 13px;
}

/* `.fname` already takes the slack when a file is loaded; without a file the
   button still has to sit at the right edge. */
.fname ~ .mini {
  margin-left: 0;
}

.drophint {
  margin-left: auto;
  align-self: center;
}

.exports {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.src {
  flex: 1;
  min-height: 240px;
}

.row {
  display: flex;
  gap: 8px;
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

.rows {
  flex: 1;
  font-size: var(--t-sm);
  line-height: 1.7;
  padding: 6px 0;
}

.pad {
  padding: 12px 14px;
}

/* One line per row: both line numbers, a sign, then the text. Tinted
   backgrounds carry the change, the sign carries it again for safety. */
.drow {
  display: grid;
  grid-template-columns: 44px 44px 16px 1fr;
  gap: 4px;
  padding: 0 12px;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}

.drow.add {
  background: var(--ok-wash);
}

.drow.del {
  background: var(--fail-wash);
}

.no {
  text-align: right;
  color: var(--ink-4);
  font-size: var(--t-xs);
  user-select: none;
}

.sign {
  text-align: center;
  font-weight: 700;
  user-select: none;
}

.drow.add .sign {
  color: var(--ok);
}

.drow.del .sign {
  color: var(--fail);
}

.text {
  min-width: 0;
}

/* The row tint says "this line changed"; the mark says which part of it did.
   It has to read as a stronger shade of the same colour, not a new one. */
.mark {
  border-radius: 3px;
  padding: 1px 0;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.drow.add .mark {
  background: var(--ok-line);
}

.drow.del .mark {
  background: var(--fail-line);
}

.skip {
  grid-column: 1 / -1;
  padding: 3px 0;
  color: var(--ink-3);
  font-size: var(--t-xs);
  text-align: center;
  background: var(--s-3);
  border-radius: var(--r-sm);
}

.trunc {
  margin: 0 14px 12px;
  flex-shrink: 0;
}
</style>
