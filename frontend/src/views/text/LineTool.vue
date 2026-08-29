<script setup lang="ts">
/**
 * Line-wise batch processing: a pipeline of steps applied in order.
 *
 * The order is the feature. Deduping then numbering is a different answer from
 * numbering then deduping — the second makes every line unique first — so the
 * steps are a visible, reorderable list rather than a row of buttons that each
 * mutate the text once and forget how they got there.
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
import { runPipeline, splitLines, stats, type Step, type StepKind } from "../../lib/lines";
import type { FileInfo } from "@bindings/hitool/services/models";

const KINDS: StepKind[] = [
  "trim",
  "mergeSpaces",
  "removeEmpty",
  "dedupe",
  "dedupeAdjacent",
  "keepDuplicates",
  "sort",
  "sortNatural",
  "sortLength",
  "reverse",
  "shuffle",
  "upper",
  "lower",
  "titleCase",
  "sentence",
  "pangu",
  "keepMatching",
  "dropMatching",
  "number",
  "affix",
  "slice",
];

/** Which extra controls a step shows. */
const NEEDS_PATTERN: StepKind[] = ["keepMatching", "dropMatching"];
const NEEDS_DESC: StepKind[] = ["sort", "sortNatural", "sortLength"];
const NEEDS_CASE: StepKind[] = ["dedupe", "dedupeAdjacent", "keepDuplicates", "sort", "keepMatching", "dropMatching"];

const src = ref("");
const name = ref("");
const steps = ref<Step[]>([{ kind: "trim" }, { kind: "removeEmpty" }, { kind: "dedupe" }]);
const seed = ref(1);

const input = computed(() => splitLines(src.value));
const output = computed(() => runPipeline(src.value, steps.value, seed.value));
const before = computed(() => stats(input.value));
const after = computed(() => stats(output.value));
const text = computed(() => output.value.join("\n"));

function add(kind: StepKind) {
  steps.value = [...steps.value, { kind }];
}

function remove(i: number) {
  steps.value = steps.value.filter((_, k) => k !== i);
}

function move(i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= steps.value.length) return;
  const next = [...steps.value];
  [next[i], next[j]] = [next[j], next[i]];
  steps.value = next;
}

function update(i: number, patch: Partial<Step>) {
  steps.value = steps.value.map((s, k) => (k === i ? { ...s, ...patch } : s));
}

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
  const paths = await pickFiles(t("common.selectFiles"), "Text", [], false);
  if (!paths.length) return;
  const { StatFiles } = await import("@bindings/hitool/services/systemservice");
  const stat = (await StatFiles(paths)) ?? [];
  if (stat.length) load(stat[0]);
}
</script>

<template>
  <ToolFrame tool-id="line-tool" shape="flow">
    <div class="field grow-field" :class="{ hot: dragActive }" data-file-drop-target="lines">
      <div class="head">
        <span class="lab">{{ t("lines.source") }}</span>
        <span v-if="name" class="fname truncate" :title="name">{{ name }}</span>
        <span v-if="input.length" class="badge">{{ input.length }}</span>
        <button class="mini" :title="t('diff.openFile')" @click="choose">
          <Icon name="FolderOpen" />
        </button>
      </div>
      <textarea
        v-model="src"
        class="textarea mono doc"
        :placeholder="t('lines.sourcePh')"
        spellcheck="false"
        @input="name = ''"
      ></textarea>
    </div>

    <div class="field">
      <span class="lab">{{ t("lines.pipeline") }}</span>
      <div v-if="steps.length" class="steps">
        <div v-for="(s, i) in steps" :key="i" class="step">
          <span class="num">{{ i + 1 }}</span>
          <span class="kind">{{ t(`lines.k_${s.kind}`) }}</span>

          <input
            v-if="NEEDS_PATTERN.includes(s.kind)"
            :value="s.pattern ?? ''"
            class="input mono tiny"
            :placeholder="t('lines.pattern')"
            spellcheck="false"
            @input="update(i, { pattern: ($event.target as HTMLInputElement).value })"
          />
          <button
            v-if="NEEDS_PATTERN.includes(s.kind)"
            class="chip mini-chip"
            :class="{ on: s.regex }"
            @click="update(i, { regex: !s.regex })"
          >
            .*
          </button>

          <template v-if="s.kind === 'affix'">
            <input
              :value="s.prefix ?? ''"
              class="input mono tiny"
              :placeholder="t('lines.prefix')"
              @input="update(i, { prefix: ($event.target as HTMLInputElement).value })"
            />
            <input
              :value="s.suffix ?? ''"
              class="input mono tiny"
              :placeholder="t('lines.suffix')"
              @input="update(i, { suffix: ($event.target as HTMLInputElement).value })"
            />
          </template>

          <input
            v-if="s.kind === 'number'"
            :value="s.start ?? 1"
            type="number"
            class="input mono tiny num"
            @input="update(i, { start: Number(($event.target as HTMLInputElement).value) })"
          />

          <template v-if="s.kind === 'slice'">
            <input
              :value="s.from ?? 1"
              type="number"
              min="1"
              class="input mono tiny num"
              @input="update(i, { from: Number(($event.target as HTMLInputElement).value) })"
            />
            <input
              :value="s.to ?? 0"
              type="number"
              min="0"
              class="input mono tiny num"
              :title="t('lines.toHint')"
              @input="update(i, { to: Number(($event.target as HTMLInputElement).value) })"
            />
          </template>

          <button
            v-if="NEEDS_DESC.includes(s.kind)"
            class="chip mini-chip"
            :class="{ on: s.desc }"
            :title="t('lines.desc')"
            @click="update(i, { desc: !s.desc })"
          >
            <Icon :name="s.desc ? 'ArrowDown' : 'ArrowUp'" />
          </button>
          <button
            v-if="NEEDS_CASE.includes(s.kind)"
            class="chip mini-chip"
            :class="{ on: s.ignoreCase }"
            :title="t('lines.ignoreCase')"
          @click="update(i, { ignoreCase: !s.ignoreCase })"
          >
            Aa
          </button>
          <button
            v-if="s.kind === 'shuffle'"
            class="chip mini-chip"
            :title="t('lines.reshuffle')"
            @click="seed = seed + 1"
          >
            <Icon name="Shuffle" />
          </button>

          <span class="spacer" />
          <button class="mini" :disabled="i === 0" @click="move(i, -1)"><Icon name="ChevronUp" /></button>
          <button class="mini" :disabled="i === steps.length - 1" @click="move(i, 1)"><Icon name="ChevronDown" /></button>
          <button class="mini rm" @click="remove(i)"><Icon name="X" /></button>
        </div>
      </div>
      <p v-else class="hint">{{ t("lines.noSteps") }}</p>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("lines.result") }}</span>
        <span class="badge">{{ after.lines }}</span>
        <span v-if="input.length" class="lab delta" :class="after.lines < before.lines ? 'down' : ''">
          {{ after.lines - before.lines >= 0 ? "+" : "" }}{{ after.lines - before.lines }}
        </span>
        <button class="btn btn-sm btn-quiet" :disabled="!output.length" @click="copyText(text, t('common.copied'))">
          <Icon name="Copy" />
        </button>
      </div>

      <div class="out scroll-y mono">
        <template v-if="output.length">
          <div v-for="(l, i) in output.slice(0, 2000)" :key="i" class="oline">{{ l || " " }}</div>
          <p v-if="output.length > 2000" class="hint pad">{{ t("lines.truncated", { n: output.length }) }}</p>
        </template>
        <p v-else class="hint pad">{{ t("lines.idle") }}</p>
      </div>

      <div class="statbar">
        <span><span class="lab">{{ t("lines.unique") }}</span> {{ after.unique }}</span>
        <span><span class="lab">{{ t("lines.dupes") }}</span> {{ after.duplicates }}</span>
        <span><span class="lab">{{ t("lines.words") }}</span> {{ after.words }}</span>
        <span><span class="lab">{{ t("lines.chars") }}</span> {{ after.chars }}</span>
        <span><span class="lab">{{ t("lines.longest") }}</span> {{ after.longest }}</span>
      </div>
    </template>

    <template #inspector>
      <InspectorSection :title="t('lines.addStep')" icon="Plus" :open="true">
        <div class="chips">
          <button v-for="k in KINDS" :key="k" class="chip" @click="add(k)">
            {{ t(`lines.k_${k}`) }}
          </button>
        </div>
      </InspectorSection>

      <InspectorSection :title="t('lines.about')" icon="Info">
        <p class="hint">{{ t("lines.aboutOrder") }}</p>
        <p class="hint">{{ t("lines.aboutRegex") }}</p>
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

.doc {
  flex: 1;
  min-height: 180px;
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 7px;
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  background: var(--s-2);
  font-size: var(--t-sm);
}

.num {
  min-width: 15px;
  color: var(--ink-4);
  font-size: var(--t-xs);
  font-family: var(--f-mono);
}

.kind {
  flex-shrink: 0;
}

.spacer {
  flex: 1;
}

.tiny {
  width: 108px;
  padding: 3px 7px;
  font-size: var(--t-xs);
}

.num.tiny,
.tiny.num {
  width: 62px;
  text-align: right;
}

.mini-chip {
  padding: 2px 6px;
  font-size: 10px;
  min-height: 0;
}

.mini-chip :deep(svg) {
  width: 11px;
  height: 11px;
}

.mini {
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

.mini:hover:not(:disabled) {
  background: var(--s-3);
  color: var(--ink);
}

.mini:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.mini.rm:hover {
  background: var(--fail-wash);
  color: var(--fail);
}

.mini :deep(svg) {
  width: 12px;
  height: 12px;
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

.delta.down {
  color: var(--fail);
}

.out {
  flex: 1;
  padding: 8px 14px;
  font-size: var(--t-sm);
  line-height: 1.7;
}

.oline {
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}

.pad {
  padding: 8px 0;
}

.statbar {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  padding: 9px 14px;
  border-top: 1px solid var(--line);
  font-size: var(--t-xs);
  flex-shrink: 0;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
</style>
