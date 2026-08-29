<script setup lang="ts">
/**
 * Transform bench: left input, right output. Polish / translate / table.
 * Streaming, history and templates live in useAiEngine.
 */
import { computed, ref, useSlots, watch } from "vue";
import { openSettings } from "../stores/settings";
import ToolFrame from "../work/ToolFrame.vue";
import Icon from "./Icon.vue";
import KbdCombo from "./KbdCombo.vue";
import { t } from "../lib/i18n";
import { useAiEngine } from "../lib/useAiEngine";
import { render } from "../lib/markdown";
import type { ChatMsg } from "../lib/aiTasks";

const props = defineProps<{
  toolId: string;
  placeholder: string;
  buildMessages: (input: string) => ChatMsg[];
}>();

const slots = useSlots();
const engine = useAiEngine(() => props.toolId);
const {
  input,
  output,
  busy,
  hasKey,
  errorMsg,
  records,
  templates,
  panel,
  saveName,
  saveError,
  snippet,
  fmtTime,
  togglePanel,
  restoreRecord,
  dropRecord,
  clearHistory,
  useTemplate,
  dropTemplate,
  saveTemplate,
  run: runEngine,
  stop,
  copy,
} = engine;

const md = ref(true);
const outEl = ref<HTMLElement | null>(null);
const html = computed(() => render(output.value).html);

watch(output, () => {
  if (!busy.value) return;
  const el = outEl.value;
  if (el) el.scrollTop = el.scrollHeight;
});

async function run() {
  if (!input.value.trim() || busy.value) return;
  await runEngine(props.buildMessages(input.value), input.value);
}

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    void run();
  }
}
</script>

<template>
  <ToolFrame :tool-id="props.toolId" shape="flow">
    <template v-if="!hasKey" #notice>
      <div class="banner warn">
        <Icon name="KeyRound" />
        <span class="grow">{{ t("ai.noKey") }}</span>
        <button class="btn btn-sm" @click="openSettings('ai')">
          {{ t("common.goSettings") }}
        </button>
      </div>
    </template>

    <slot name="before" />

    <div class="field grow-field">
      <div class="side-head">
        <span class="lab">{{ t("ai.input") }}</span>
        <span v-if="input" class="badge">{{ input.length }}</span>
        <button
          class="btn btn-sm btn-quiet head-btn"
          :class="{ on: panel === 'templates' }"
          @click="togglePanel('templates')"
        >
          <Icon name="BookOpenText" /> {{ t("ai.tpl.title") }}
        </button>
        <button
          class="btn btn-sm btn-quiet head-btn"
          :class="{ on: panel === 'history' }"
          @click="togglePanel('history')"
        >
          <Icon name="History" /> {{ t("ai.hist.title") }}
          <span v-if="records.length" class="badge">{{ records.length }}</span>
        </button>
      </div>

      <div v-if="panel === 'templates'" class="drawer scroll-y">
        <button v-for="tpl in templates" :key="tpl.id" class="rowbtn tpl" @click="useTemplate(tpl)">
          <span class="tpl-name">{{ tpl.name }}</span>
          <span class="tpl-body mono truncate">{{ snippet(tpl.body, 64) }}</span>
          <span
            v-if="!tpl.builtin"
            class="x"
            :title="t('ai.tpl.remove')"
            @click.stop="dropTemplate(tpl.id)"
          >
            <Icon name="X" />
          </span>
        </button>
        <div class="save-row">
          <input
            v-model="saveName"
            class="input"
            :placeholder="t('ai.tpl.savePh')"
            spellcheck="false"
            @keydown.enter="saveTemplate"
          />
          <button
            class="btn btn-sm"
            :disabled="!saveName.trim() || !input.trim()"
            :title="t('ai.tpl.saveHint')"
            @click="saveTemplate"
          >
            <Icon name="Plus" /> {{ t("ai.tpl.save") }}
          </button>
        </div>
        <span v-if="saveError" class="hint warn">{{ saveError }}</span>
      </div>

      <div v-else-if="panel === 'history'" class="drawer scroll-y">
        <template v-if="records.length">
          <button v-for="r in records" :key="r.id" class="rowbtn hist" @click="restoreRecord(r)">
            <span class="hmeta">
              <span class="htool">{{ t(`tools.${r.toolId}.name`) }}</span>
              <span class="htime">{{ fmtTime(r.ts) }}</span>
            </span>
            <span class="tpl-body mono truncate">{{ snippet(r.input, 48) }} → {{ snippet(r.output, 48) }}</span>
            <span class="x" :title="t('ai.hist.remove')" @click.stop="dropRecord(r.id)">
              <Icon name="X" />
            </span>
          </button>
          <button class="btn btn-sm btn-quiet" @click="clearHistory">{{ t("ai.hist.clear") }}</button>
        </template>
        <span v-else class="hint">{{ t("ai.hist.empty") }}</span>
      </div>

      <textarea
        v-model="input"
        class="textarea src"
        :placeholder="props.placeholder"
        spellcheck="false"
        @keydown="onKey"
      ></textarea>
    </div>

    <div v-if="errorMsg" class="banner fail">{{ errorMsg }}</div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("ai.output") }}</span>
        <span v-if="output" class="badge">{{ t("ai.chars", { n: output.length }) }}</span>
        <button class="btn btn-sm btn-quiet md-toggle" :class="{ on: md }" @click="md = !md">
          <Icon name="FileText" /> {{ t("ai.md") }}
        </button>
        <button class="btn btn-sm btn-quiet" :disabled="!output || busy" @click="copy">
          <Icon name="Copy" /> {{ t("common.copy") }}
        </button>
      </div>
      <div ref="outEl" class="out scroll-y" :class="{ plain: !md }">
        <template v-if="output || busy">
          <article v-if="md" class="md" v-html="html"></article>
          <template v-else>{{ output }}</template>
          <span v-if="busy" class="caret">▍</span>
        </template>
        <span v-else class="hint">{{ t("ai.outputIdle") }}</span>
      </div>
    </template>

    <template v-if="slots.controls" #inspector>
      <slot name="controls" />
    </template>

    <template #run>
      <button class="btn btn-signal" :disabled="!input.trim() || busy" @click="run">
        <Icon v-if="busy" name="LoaderCircle" class="spin" />
        <Icon v-else name="Play" />
        {{ busy ? t("ai.generating") : t("ai.run") }}
        <KbdCombo v-if="!busy" combo="mod+enter" />
      </button>
      <button v-if="busy" class="btn btn-danger" @click="stop">{{ t("ai.stop") }}</button>
      <button
        v-else-if="input || output"
        class="btn btn-quiet"
        @click="input = ''; output = ''; errorMsg = ''"
      >
        {{ t("ai.clear") }}
      </button>
    </template>
  </ToolFrame>
</template>

<style scoped>
.grow {
  flex: 1;
  min-width: 0;
}

.head-btn {
  margin-left: auto;
}

.head-btn + .head-btn {
  margin-left: 0;
}

.head-btn.on {
  background: var(--acc-wash);
  color: var(--acc);
}

.drawer {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 190px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-2);
  flex-shrink: 0;
}

.rowbtn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  font-family: var(--f-ui);
  font-size: var(--t-sm);
  text-align: left;
  cursor: pointer;
}

.rowbtn:hover {
  background: var(--s-3);
  color: var(--ink);
}

.tpl-name {
  flex-shrink: 0;
  min-width: 76px;
  font-weight: 600;
  color: var(--ink);
}

.tpl-body {
  flex: 1;
  min-width: 0;
  font-size: var(--t-xs);
  color: var(--ink-3);
}

.x {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: var(--r-sm);
  color: var(--ink-3);
  flex-shrink: 0;
}

.x:hover {
  background: var(--fail-wash, var(--s-3));
  color: var(--fail);
}

.x :deep(svg) {
  width: 12px;
  height: 12px;
}

.save-row {
  display: flex;
  gap: 8px;
  padding: 4px 2px 0;
  border-top: 1px solid var(--line);
  margin-top: 4px;
}

.save-row .input {
  flex: 1;
  height: 30px;
}

.hmeta {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-width: 110px;
}

.htool {
  font-weight: 600;
  color: var(--ink);
}

.htime {
  font-size: var(--t-xs);
  color: var(--ink-3);
}

.warn {
  color: var(--warn);
}

.grow-field {
  flex: 1;
  min-height: 0;
}

.side-head,
.res-head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.res-head {
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.res-head .btn {
  margin-left: auto;
}

.res-head .md-toggle {
  margin-left: auto;
}

.res-head .md-toggle.on {
  background: var(--acc-wash);
  color: var(--acc);
}

.src {
  flex: 1;
  min-height: 300px;
  font-size: var(--t-md);
  line-height: 1.75;
}

.out {
  flex: 1;
  padding: 14px;
  font-size: var(--t-sm);
  line-height: 1.8;
  user-select: text;
}

.out.plain {
  font-family: var(--f-mono);
  white-space: pre-wrap;
  word-break: break-word;
}

.out :deep(.md) {
  font-size: var(--t-sm);
  line-height: 1.8;
}

.out :deep(.md h1),
.out :deep(.md h2),
.out :deep(.md h3),
.out :deep(.md h4) {
  margin: 0.9em 0 0.4em;
  line-height: 1.35;
}

.out :deep(.md h1) {
  font-size: 1.35em;
}

.out :deep(.md h2) {
  font-size: 1.15em;
}

.out :deep(.md h3),
.out :deep(.md h4) {
  font-size: 1.02em;
}

.out :deep(.md p) {
  margin: 0.5em 0;
}

.out :deep(.md ul),
.out :deep(.md ol) {
  margin: 0.5em 0;
  padding-left: 1.4em;
}

.out :deep(.md code) {
  background: var(--s-3);
  padding: 0.12em 0.35em;
  border-radius: var(--r-sm);
  font-family: var(--f-mono);
  font-size: 0.92em;
}

.out :deep(.md pre) {
  background: var(--s-3);
  padding: 10px 12px;
  border-radius: var(--r-sm);
  overflow-x: auto;
  margin: 0.6em 0;
}

.out :deep(.md pre code) {
  background: none;
  padding: 0;
}

.out :deep(.md blockquote) {
  margin: 0.6em 0;
  padding: 0.1em 0.9em;
  border-left: 3px solid var(--line);
  color: var(--ink-2);
}

.out :deep(.md table) {
  border-collapse: collapse;
  margin: 0.6em 0;
}

.out :deep(.md th),
.out :deep(.md td) {
  border: 1px solid var(--line);
  padding: 5px 9px;
  text-align: left;
}

.out :deep(.md a) {
  color: var(--acc);
}

.out :deep(.md hr) {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 1em 0;
}

.caret {
  display: inline-block;
  color: var(--acc);
  animation: blink 1s steps(2, start) infinite;
}

@keyframes blink {
  to {
    visibility: hidden;
  }
}
</style>
