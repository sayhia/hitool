<script setup lang="ts">
/**
 * Structural comparison of two JSON documents.
 *
 * Formatting both and running them through the text diff was the workaround,
 * and it answers the wrong question: reordered keys read as changes, and one
 * altered field hides inside re-indented context. This reports differences by
 * path instead — the same spelling the JSONPath box takes.
 */
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText, toast } from "../../stores/toast";
import { errText } from "../../lib/err";
import { pickFiles, readFileBytes, formatBytes } from "../../lib/backend";
import { onFilesDropped, dragActive, useFileHandoff } from "../../lib/drop";
import { decodeText, MAX_TEXT_BYTES } from "../../lib/textfile";
import {
  diffJson,
  filterByPath,
  preview,
  summarise,
  typeName,
  type ChangeKind,
} from "../../lib/jsonDiff";
import type { FileInfo } from "@bindings/hitool/services/models";

type Side = "left" | "right";

const left = ref("");
const right = ref("");
const names = ref<Record<Side, string>>({ left: "", right: "" });
const hidden = ref<Set<ChangeKind>>(new Set());
const pathQuery = ref("");

const SAMPLE_LEFT = `{
  "name": "hitool",
  "version": "0.4.6",
  "tools": 45,
  "features": ["pdf", "image", "audio"],
  "build": { "target": "darwin", "size": "21M" }
}`;

const SAMPLE_RIGHT = `{
  "version": "0.5.0",
  "name": "hitool",
  "tools": "46",
  "features": ["pdf", "image", "video", "audio"],
  "build": { "target": "darwin", "size": "22M", "signed": true }
}`;

function parsed(text: string): { value?: unknown; error: string } {
  if (!text.trim()) return { error: "" };
  try {
    return { value: JSON.parse(text), error: "" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const leftDoc = computed(() => parsed(left.value));
const rightDoc = computed(() => parsed(right.value));
const ready = computed(
  () => !leftDoc.value.error && !rightDoc.value.error && !!left.value.trim() && !!right.value.trim(),
);

const result = computed(() =>
  ready.value ? summarise(diffJson(leftDoc.value.value, rightDoc.value.value)) : null,
);

const visible = computed(() =>
  filterByPath(
    result.value?.changes.filter((c) => !hidden.value.has(c.kind)) ?? [],
    pathQuery.value,
  ),
);

const identical = computed(() => !!result.value && result.value.changes.length === 0);

function toggle(kind: ChangeKind) {
  const next = new Set(hidden.value);
  if (next.has(kind)) next.delete(kind);
  else next.add(kind);
  hidden.value = next;
}

/** Plain-text report, for pasting into a ticket. */
const asText = computed(() =>
  visible.value
    .map((c) => {
      if (c.kind === "add") return `+ ${c.path}  ${preview(c.right, 200)}`;
      if (c.kind === "remove") return `- ${c.path}  ${preview(c.left, 200)}`;
      return `~ ${c.path}  ${preview(c.left, 200)} → ${preview(c.right, 200)}`;
    })
    .join("\n"),
);

// ---------- loading ----------

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
    names.value = { ...names.value, [side]: f.name };
  } catch (e) {
    toast(errText(e), "fail");
  }
}

onFilesDropped((dropped, zone) => {
  if (dropped.length >= 2) {
    load(dropped[0], "left");
    load(dropped[1], "right");
    return;
  }
  const side: Side =
    zone === "jsondiff-right"
      ? "right"
      : zone === "jsondiff-left"
        ? "left"
        : left.value
          ? "right"
          : "left";
  load(dropped[0], side);
});

/**
 * Two files chosen on the launcher land here in order. This tool has no
 * SourceTray to receive them, so it takes the handoff itself — through the
 * shared reader, since the state behind it can only be read once.
 */
useFileHandoff((files) => {
  if (files[0]) load(files[0], "left");
  if (files[1]) load(files[1], "right");
});

async function choose(side: Side) {
  const paths = await pickFiles(t("common.selectFiles"), "JSON", ["json"], false);
  if (!paths.length) return;
  const { StatFiles } = await import("@bindings/hitool/services/systemservice");
  const stat = (await StatFiles(paths)) ?? [];
  if (stat.length) load(stat[0], side);
}

function touched(side: Side) {
  if (names.value[side]) names.value = { ...names.value, [side]: "" };
}

function loadSample() {
  left.value = SAMPLE_LEFT;
  right.value = SAMPLE_RIGHT;
  names.value = { left: "", right: "" };
}

function swap() {
  const a = left.value;
  left.value = right.value;
  right.value = a;
  names.value = { left: names.value.right, right: names.value.left };
}

function clearAll() {
  left.value = "";
  right.value = "";
  names.value = { left: "", right: "" };
}
</script>

<template>
  <ToolFrame tool-id="json-diff" shape="flow">
    <div class="pair">
      <div
        v-for="side in (['left', 'right'] as const)"
        :key="side"
        class="field side"
        :class="{ hot: dragActive }"
        :data-file-drop-target="`jsondiff-${side}`"
      >
        <div class="head">
          <span class="lab">{{ t(`jsondiff.${side}`) }}</span>
          <span v-if="names[side]" class="fname truncate" :title="names[side]">{{ names[side] }}</span>
          <span
            v-else-if="(side === 'left' ? leftDoc : rightDoc).value !== undefined"
            class="badge"
          >
            {{ typeName((side === "left" ? leftDoc : rightDoc).value) }}
          </span>
          <button class="mini" :title="t('diff.openFile')" @click="choose(side)">
            <Icon name="FolderOpen" />
          </button>
        </div>
        <textarea
          v-if="side === 'left'"
          v-model="left"
          class="textarea mono src"
          :class="{ bad: !!leftDoc.error }"
          :placeholder="t('jsondiff.leftPh')"
          spellcheck="false"
          @input="touched('left')"
        ></textarea>
        <textarea
          v-else
          v-model="right"
          class="textarea mono src"
          :class="{ bad: !!rightDoc.error }"
          :placeholder="t('jsondiff.rightPh')"
          spellcheck="false"
          @input="touched('right')"
        ></textarea>
        <p v-if="(side === 'left' ? leftDoc : rightDoc).error" class="err">
          {{ (side === "left" ? leftDoc : rightDoc).error }}
        </p>
      </div>
    </div>

    <div class="row">
      <button class="btn btn-sm" :disabled="!left && !right" @click="swap">
        <Icon name="ArrowLeftRight" /> {{ t("diff.swap") }}
      </button>
      <button class="btn btn-sm btn-quiet" @click="loadSample">{{ t("jsondiff.sample") }}</button>
      <button class="btn btn-sm btn-quiet" :disabled="!left && !right" @click="clearAll">
        {{ t("common.clear") }}
      </button>
      <span class="hint drophint">{{ t("jsondiff.dropHint") }}</span>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("jsondiff.result") }}</span>
        <template v-if="result">
          <span v-if="result.added" class="badge ok">+{{ result.added }}</span>
          <span v-if="result.removed" class="badge fail">−{{ result.removed }}</span>
          <span v-if="result.changed" class="badge warn">~{{ result.changed }}</span>
          <span v-if="identical" class="badge ok">{{ t("jsondiff.identical") }}</span>
        </template>
        <button
          class="btn btn-sm btn-quiet"
          :disabled="!visible.length"
          :title="t('common.copy')"
          @click="copyText(asText, t('common.copied'))"
        >
          <Icon name="Copy" />
        </button>
      </div>

      <div class="changes scroll-y">
        <template v-if="visible.length">
          <div v-for="(c, i) in visible" :key="i" class="chg" :class="c.kind">
            <div class="chg-head">
              <span class="sign">{{ c.kind === "add" ? "+" : c.kind === "remove" ? "−" : "~" }}</span>
              <button
                class="path mono"
                :title="t('jsondiff.copyPath')"
                @click="copyText(c.path, t('common.copied'))"
              >
                {{ c.path }}
              </button>
              <button class="scope" :title="t('jsondiff.scopeHere')" @click="pathQuery = c.path">
                <Icon name="Crosshair" />
              </button>
              <span v-if="c.kind === 'type'" class="badge warn">
                {{ typeName(c.left) }} → {{ typeName(c.right) }}
              </span>
            </div>
            <div class="vals mono">
              <code v-if="c.kind !== 'add'" class="v old">{{ preview(c.left) }}</code>
              <Icon v-if="c.kind === 'change' || c.kind === 'type'" name="ArrowRight" />
              <code v-if="c.kind !== 'remove'" class="v new">{{ preview(c.right) }}</code>
            </div>
          </div>
        </template>
        <p v-else-if="identical" class="banner ok m">{{ t("jsondiff.identicalNote") }}</p>
        <p v-else-if="result" class="hint m">{{ t("jsondiff.allFiltered") }}</p>
        <p v-else class="hint m">{{ t("jsondiff.idle") }}</p>
      </div>

      <p v-if="result?.truncated" class="banner warn m">{{ t("jsondiff.truncated") }}</p>
    </template>

    <template #inspector>
      <InspectorSection :title="t('jsondiff.scope')" icon="Crosshair">
        <div class="scopebox">
          <input
            v-model="pathQuery"
            class="input mono"
            :placeholder="t('jsondiff.scopePh')"
            spellcheck="false"
          />
          <button class="btn btn-sm btn-quiet" :disabled="!pathQuery" @click="pathQuery = ''">
            <Icon name="X" />
          </button>
        </div>
        <p class="hint">{{ t("jsondiff.scopeHint") }}</p>
      </InspectorSection>

      <InspectorSection :title="t('jsondiff.filter')" icon="Filter">
        <div class="chips">
          <button
            v-for="k in (['add', 'remove', 'change', 'type'] as const)"
            :key="k"
            class="chip"
            :class="{ on: !hidden.has(k) }"
            @click="toggle(k)"
          >
            {{ t(`jsondiff.kind_${k}`) }}
          </button>
        </div>
        <p class="hint">{{ t("jsondiff.filterHint") }}</p>
      </InspectorSection>

      <InspectorSection :title="t('jsondiff.about')" icon="Info">
        <p class="hint">{{ t("jsondiff.aboutKeys") }}</p>
        <p class="hint">{{ t("jsondiff.aboutArrays") }}</p>
        <p class="hint">{{ t("jsondiff.aboutPaths") }}</p>
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

.src {
  flex: 1;
  min-height: 240px;
}

.textarea.bad {
  border-color: var(--fail);
}

.err {
  font-size: var(--t-xs);
  color: var(--fail);
  margin-top: 4px;
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
  gap: 8px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.res-head .btn {
  margin-left: auto;
}

.changes {
  flex: 1;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.m {
  margin: 12px 14px;
}

.chg {
  border: 1px solid var(--line);
  border-left-width: 3px;
  border-radius: var(--r);
  background: var(--s-1);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.chg.add {
  border-left-color: var(--ok);
}

.chg.remove {
  border-left-color: var(--fail);
}

.chg.change,
.chg.type {
  border-left-color: var(--warn);
}

.chg-head {
  display: flex;
  align-items: center;
  gap: 7px;
}

.sign {
  font-weight: 700;
  font-family: var(--f-mono);
  flex-shrink: 0;
}

.chg.add .sign {
  color: var(--ok);
}

.chg.remove .sign {
  color: var(--fail);
}

.chg.change .sign,
.chg.type .sign {
  color: var(--warn);
}

/* The path is the reusable part of a row — it reads as text but copies. */
.path {
  border: 0;
  background: transparent;
  padding: 0;
  font-size: var(--t-sm);
  color: var(--acc);
  cursor: pointer;
  text-align: left;
  word-break: break-all;
  min-width: 0;
}

.path:hover {
  text-decoration: underline;
}

.vals {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  font-size: var(--t-sm);
}

.vals :deep(svg) {
  width: 12px;
  height: 12px;
  color: var(--ink-4);
  flex-shrink: 0;
}

.v {
  padding: 1px 5px;
  border-radius: var(--r-sm);
  word-break: break-all;
  user-select: text;
}

.v.old {
  background: var(--fail-wash);
  color: var(--fail);
}

.v.new {
  background: var(--ok-wash);
  color: var(--ok);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.scopebox {
  display: flex;
  gap: 6px;
  align-items: center;
}

.scopebox .input {
  flex: 1;
  min-width: 0;
}

/* Sits with the path it scopes to, so the gesture reads as "just this". */
.scope {
  border: 0;
  background: transparent;
  color: var(--ink-4);
  cursor: pointer;
  padding: 0 2px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.scope:hover {
  color: var(--acc);
}

.scope :deep(svg) {
  width: 12px;
  height: 12px;
}
</style>
