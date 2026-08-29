<script setup lang="ts">
/**
 * Batch rename.
 *
 * This is the only tool in HiTool that modifies files the user already had,
 * so the preview is not a nicety — it is the tool. Every rule change re-plans
 * against the real filesystem, the table always shows old → new for every row,
 * and Go refuses the whole batch if any single row would collide. There is no
 * "resolve automatically": silently appending _1 to a name is how people lose
 * track of which file is which.
 */
import { computed, ref, watch } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import SourceTray from "../../work/SourceTray.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { errText } from "../../lib/err";
import { toast } from "../../stores/toast";
import * as RenameService from "@bindings/hitool/services/renameservice";
import type { FileInfo, RenamePlan, RenameRule } from "@bindings/hitool/services/models";

const files = ref<FileInfo[]>([]);

const find = ref("");
const replace = ref("");
const regex = ref(false);
const caseSensitive = ref(true);
const prefix = ref("");
const suffix = ref("");
const caseMode = ref("");
const numbering = ref(false);
const startAt = ref(1);
const padding = ref(3);
const extension = ref("");

const plan = ref<RenamePlan | null>(null);
const busy = ref(false);
const applied = ref(false);

const rule = computed<RenameRule>(() => ({
  find: find.value,
  replace: replace.value,
  regex: regex.value,
  caseSensitive: caseSensitive.value,
  prefix: prefix.value,
  suffix: suffix.value,
  caseMode: caseMode.value,
  numbering: numbering.value,
  startAt: startAt.value,
  padding: padding.value,
  extension: extension.value,
}));

let debounce = 0;
watch(
  [files, rule],
  () => {
    applied.value = false;
    clearTimeout(debounce);
    debounce = window.setTimeout(refreshPlan, 140);
  },
  { deep: true },
);

async function refreshPlan() {
  if (!files.value.length) {
    plan.value = null;
    return;
  }
  try {
    plan.value = await RenameService.Plan(files.value.map((f) => f.path), rule.value);
  } catch (e) {
    toast(errText(e), "fail");
  }
}

const conflicts = computed(() => plan.value?.conflicts ?? 0);
const changed = computed(() => plan.value?.changed ?? 0);
const canApply = computed(() => !busy.value && changed.value > 0 && conflicts.value === 0);

async function apply() {
  if (!canApply.value) return;
  busy.value = true;
  try {
    const res = await RenameService.Apply(files.value.map((f) => f.path), rule.value);
    if (!res) throw new Error(t("common.failed"));
    if (res.failed) toast((res.errors ?? []).join("\n") || t("rename.someFailed"), "fail");
    if (res.renamed) toast(t("rename.done", { n: res.renamed }), "ok");
    applied.value = true;

    // The paths in the tray are now stale — repoint them at the new names so
    // a second pass operates on what is actually on disk.
    const map = new Map((plan.value?.items ?? []).map((i) => [i.path, i]));
    files.value = files.value.map((f) => {
      const it = map.get(f.path);
      if (!it || !it.changed) return f;
      const dir = f.path.slice(0, f.path.lastIndexOf("/"));
      return { ...f, path: `${dir}/${it.newName}`, name: it.newName };
    });
    resetRule();
  } catch (e) {
    toast(errText(e), "fail");
  } finally {
    busy.value = false;
  }
}

/** After a successful pass the rule has been consumed; leaving it armed
 *  invites a second accidental application on the new names. */
function resetRule() {
  find.value = "";
  replace.value = "";
  prefix.value = "";
  suffix.value = "";
  caseMode.value = "";
  numbering.value = false;
  extension.value = "";
}

const PROBLEMS: Record<string, string> = {
  "empty name": "rename.problem.empty",
  "illegal character": "rename.problem.illegal",
  "name too long": "rename.problem.tooLong",
  "duplicate target": "rename.problem.duplicate",
  "target exists": "rename.problem.exists",
};

const problemText = (p: string) => (PROBLEMS[p] ? t(PROBLEMS[p]) : p);
</script>

<template>
  <ToolFrame tool-id="batch-rename" shape="batch">
    <template #source>
      <SourceTray v-model="files" :multiple="true" :ordered="true" :disabled="busy" filter-name="Files" />
      <p class="hint order">{{ t("rename.orderHint") }}</p>
    </template>

    <div class="field">
      <div class="head">
        <span class="lab">{{ t("rename.find") }}</span>
        <label class="check">
          <input v-model="regex" type="checkbox" />
          {{ t("rename.regex") }}
        </label>
        <label class="check">
          <input v-model="caseSensitive" type="checkbox" />
          Aa
        </label>
      </div>
      <input
        v-model="find"
        class="input mono"
        :placeholder="regex ? '(\\d{4})-(\\d{2})' : t('rename.findPh')"
        spellcheck="false"
      />
    </div>

    <div class="field">
      <span class="lab">{{ t("rename.replace") }}</span>
      <input
        v-model="replace"
        class="input mono"
        :placeholder="regex ? '$2$1' : t('rename.replacePh')"
        spellcheck="false"
      />
      <p v-if="regex" class="hint">{{ t("rename.groupHint") }}</p>
    </div>

    <div class="two">
      <div class="field">
        <span class="lab">{{ t("rename.prefix") }}</span>
        <input v-model="prefix" class="input mono" placeholder="{n}_" spellcheck="false" />
      </div>
      <div class="field">
        <span class="lab">{{ t("rename.suffix") }}</span>
        <input v-model="suffix" class="input mono" spellcheck="false" />
      </div>
    </div>

    <div class="field">
      <span class="lab">{{ t("rename.case") }}</span>
      <div class="seg">
        <button :class="{ on: caseMode === '' }" @click="caseMode = ''">{{ t("rename.caseKeep") }}</button>
        <button :class="{ on: caseMode === 'lower' }" @click="caseMode = 'lower'">abc</button>
        <button :class="{ on: caseMode === 'upper' }" @click="caseMode = 'upper'">ABC</button>
        <button :class="{ on: caseMode === 'title' }" @click="caseMode = 'title'">Abc</button>
      </div>
    </div>

    <div class="field">
      <label class="check">
        <input v-model="numbering" type="checkbox" />
        {{ t("rename.numbering") }}
      </label>
      <div v-if="numbering" class="two">
        <label class="sub">
          <span class="lab">{{ t("rename.startAt") }}</span>
          <input v-model.number="startAt" type="number" min="0" class="input mono" />
        </label>
        <label class="sub">
          <span class="lab">{{ t("rename.padding") }}</span>
          <input v-model.number="padding" type="number" min="1" max="9" class="input mono" />
        </label>
      </div>
      <p v-if="numbering" class="hint">{{ t("rename.numberHint") }}</p>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("rename.preview") }}</span>
        <span v-if="changed" class="badge acc">{{ t("rename.willChange", { n: changed }) }}</span>
        <span v-if="conflicts" class="badge fail">{{ t("rename.conflicts", { n: conflicts }) }}</span>
      </div>

      <p v-if="plan?.error" class="banner fail inset">{{ plan.error }}</p>
      <p v-else-if="conflicts" class="banner warn inset">{{ t("rename.blocked") }}</p>
      <p v-else-if="applied && changed === 0" class="banner ok inset">{{ t("rename.appliedNote") }}</p>

      <div class="res-body scroll-y">
        <div
          v-for="it in plan?.items ?? []"
          :key="it.path"
          class="row"
          :class="{ bad: !!it.problem, dim: !it.changed && !it.problem }"
        >
          <span class="old truncate" :title="it.path">{{ it.oldName }}</span>
          <Icon name="ArrowRight" />
          <span class="new truncate" :title="it.newName">{{ it.newName }}</span>
          <span v-if="it.problem" class="badge fail">{{ problemText(it.problem) }}</span>
        </div>
        <p v-if="!files.length" class="hint pad">{{ t("bench.needFile") }}</p>
        <p v-else-if="!plan?.items?.length" class="hint pad">{{ t("rename.idle") }}</p>
      </div>
    </template>

    <template #inspector>
      <InspectorSection :title="t('rename.tokens')" icon="Braces">
        <div class="reflist">
          <button class="ref" @click="prefix = prefix + '{n}'">
            <code class="mono">{{ "{n}" }}</code>
            <span>{{ t("rename.tokenN") }}</span>
          </button>
        </div>
        <p class="hint">{{ t("rename.tokenHint") }}</p>
      </InspectorSection>

      <InspectorSection :title="t('rename.extension')" icon="FileType">
        <input
          v-model="extension"
          class="input mono"
          :placeholder="t('rename.extensionPh')"
          spellcheck="false"
        />
        <p class="hint">{{ t("rename.extensionHint") }}</p>
      </InspectorSection>

      <InspectorSection :title="t('rename.recipes')" icon="BookOpen">
        <div class="reflist">
          <button
            class="ref col"
            @click="regex = true; find = '^(.*)$'; replace = '$1'; prefix = '{n}_'; numbering = true"
          >
            <span class="rname">{{ t("rename.recipe.number") }}</span>
            <code class="mono">001_name.ext</code>
          </button>
          <button class="ref col" @click="regex = true; find = '[ ]+'; replace = '_'">
            <span class="rname">{{ t("rename.recipe.spaces") }}</span>
            <code class="mono">my file → my_file</code>
          </button>
          <button
            class="ref col"
            @click="regex = true; find = '(\\d{4})-(\\d{2})-(\\d{2})'; replace = '$1$2$3'"
          >
            <span class="rname">{{ t("rename.recipe.date") }}</span>
            <code class="mono">2026-08-04 → 20260804</code>
          </button>
          <button class="ref col" @click="regex = true; find = '^\\s+|\\s+$'; replace = ''">
            <span class="rname">{{ t("rename.recipe.trim") }}</span>
            <code class="mono">" name " → "name"</code>
          </button>
        </div>
      </InspectorSection>

      <InspectorSection :title="t('rename.safety')" icon="ShieldAlert">
        <p class="hint">{{ t("rename.safetyText") }}</p>
      </InspectorSection>
    </template>

    <template #run>
      <button class="btn btn-signal" :disabled="!canApply" @click="apply">
        <Icon v-if="busy" name="LoaderCircle" class="spin" />
        <Icon v-else name="PenLine" />
        {{ busy ? t("common.processing") : t("rename.run", { n: changed }) }}
      </button>
      <p v-if="conflicts" class="hint bad">{{ t("rename.fixFirst") }}</p>
      <p v-else-if="files.length && !changed" class="hint">{{ t("rename.noChange") }}</p>
      <p v-else-if="!files.length" class="hint">{{ t("bench.needFile") }}</p>
    </template>
  </ToolFrame>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.head .check {
  margin-left: auto;
}

.head .check + .check {
  margin-left: 0;
}

.check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--t-sm);
  color: var(--ink-2);
  cursor: pointer;
  white-space: nowrap;
}

.check input {
  accent-color: var(--acc);
}

.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.sub {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.order {
  padding-top: 7px;
}

.res-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.inset {
  margin: 12px 14px 0;
  flex-shrink: 0;
}

.res-body {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.pad {
  padding: 4px;
}

/* Old on the left, new on the right, same width each: the eye compares two
   columns far faster than it reads "a → b" as prose. */
.row {
  display: grid;
  grid-template-columns: 1fr 14px 1fr auto;
  align-items: center;
  gap: 9px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  font-size: var(--t-sm);
}

.row:hover {
  background: var(--s-3);
}

.row.dim {
  opacity: 0.42;
}

.row.bad {
  border-color: var(--fail-line, var(--fail));
  background: var(--fail-wash);
}

.old {
  color: var(--ink-3);
  font-family: var(--f-mono);
  min-width: 0;
}

.new {
  color: var(--ink);
  font-family: var(--f-mono);
  font-weight: 600;
  min-width: 0;
}

.row.bad .new {
  color: var(--fail);
}

.row :deep(svg) {
  width: 12px;
  height: 12px;
  color: var(--ink-4, var(--ink-3));
}

.hint.bad {
  color: var(--fail);
}

.reflist {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ref {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: var(--f-ui);
  font-size: var(--t-sm);
  color: var(--ink-2);
}

.ref.col {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.ref:hover {
  background: var(--acc-wash);
  border-color: var(--acc-line);
}

.rname {
  font-weight: 600;
  color: var(--ink);
}

.ref code {
  font-size: var(--t-xs);
  color: var(--acc);
}
</style>
