<script setup lang="ts">
/**
 * Chat bench: a thread with follow-ups. Summarize / document / explain.
 * First turn is the source plus the tool's system prompt; later turns
 * append as user messages on the same conversation.
 */
import { computed, nextTick, ref, useSlots, watch } from "vue";
import { openSettings } from "../stores/settings";
import ToolFrame from "../work/ToolFrame.vue";
import Icon from "./Icon.vue";
import KbdCombo from "./KbdCombo.vue";
import { t } from "../lib/i18n";
import { useAiEngine } from "../lib/useAiEngine";
import { render } from "../lib/markdown";
import type { AiRecord } from "../lib/aiHistory";
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

const thread = ref<ChatMsg[]>([]);
const threadEl = ref<HTMLElement | null>(null);
const started = computed(() => thread.value.some((m) => m.role === "assistant") || busy.value);

const visible = computed(() => thread.value.filter((m) => m.role !== "system"));

function bubbleHtml(content: string) {
  return render(content).html;
}

watch([output, busy], async () => {
  await nextTick();
  const el = threadEl.value;
  if (el) el.scrollTop = el.scrollHeight;
});

function seedFromRecord(r: AiRecord) {
  restoreRecord(r);
  if (r.messages?.length) {
    thread.value = r.messages;
  } else {
    thread.value = [
      { role: "user", content: r.input },
      { role: "assistant", content: r.output },
    ].filter((m) => m.content);
  }
  input.value = "";
}

function fresh() {
  thread.value = [];
  input.value = "";
  output.value = "";
  errorMsg.value = "";
  panel.value = "none";
}

async function send() {
  const text = input.value.trim();
  if (!text || busy.value) return;
  const isFirst = !thread.value.some((m) => m.role === "user");
  const messages = isFirst
    ? props.buildMessages(text)
    : [...thread.value, { role: "user", content: text }];
  thread.value = messages;
  input.value = "";
  await runEngine(messages, text);
  if (output.value) {
    thread.value = [...messages, { role: "assistant", content: output.value }];
  }
}

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    void send();
  }
}

function applyTemplate(tpl: { id: string; body: string; name: string; builtin?: boolean }) {
  useTemplate(tpl);
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

    <template #actions>
      <button class="btn btn-sm btn-quiet" :class="{ on: panel === 'templates' }" @click="togglePanel('templates')">
        <Icon name="BookOpenText" /> {{ t("ai.tpl.title") }}
      </button>
      <button class="btn btn-sm btn-quiet" :class="{ on: panel === 'history' }" @click="togglePanel('history')">
        <Icon name="History" /> {{ t("ai.hist.title") }}
        <span v-if="records.length" class="badge">{{ records.length }}</span>
      </button>
      <button v-if="started" class="btn btn-sm btn-quiet" @click="fresh">
        <Icon name="Plus" /> {{ t("ai.newChat") }}
      </button>
    </template>

    <div class="chat">
      <div v-if="panel === 'templates'" class="drawer scroll-y">
        <button v-for="tpl in templates" :key="tpl.id" class="rowbtn tpl" @click="applyTemplate(tpl)">
          <span class="tpl-name">{{ tpl.name }}</span>
          <span class="tpl-body mono truncate">{{ snippet(tpl.body, 64) }}</span>
          <span v-if="!tpl.builtin" class="x" :title="t('ai.tpl.remove')" @click.stop="dropTemplate(tpl.id)">
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
          <button class="btn btn-sm" :disabled="!saveName.trim() || !input.trim()" @click="saveTemplate">
            <Icon name="Plus" /> {{ t("ai.tpl.save") }}
          </button>
        </div>
        <span v-if="saveError" class="hint warn">{{ saveError }}</span>
      </div>

      <div v-else-if="panel === 'history'" class="drawer scroll-y">
        <template v-if="records.length">
          <button v-for="r in records" :key="r.id" class="rowbtn hist" @click="seedFromRecord(r)">
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

      <div ref="threadEl" class="thread scroll-y">
        <div v-if="!visible.length && !busy" class="empty">
          <p class="hint">{{ props.placeholder }}</p>
        </div>
        <template v-else>
          <div v-for="(m, i) in visible" :key="i" class="turn" :class="m.role">
            <span class="who">{{ m.role === "user" ? t("ai.you") : t("ai.assistant") }}</span>
            <article v-if="m.role === 'assistant'" class="md bubble" v-html="bubbleHtml(m.content)"></article>
            <pre v-else class="bubble user-body">{{ m.content }}</pre>
          </div>
          <div v-if="busy" class="turn assistant">
            <span class="who">{{ t("ai.assistant") }}</span>
            <article class="md bubble" v-html="bubbleHtml(output)"></article>
            <span class="caret">▍</span>
          </div>
        </template>
      </div>

      <div v-if="errorMsg" class="banner fail">{{ errorMsg }}</div>

      <div class="composer">
        <textarea
          v-model="input"
          class="textarea src"
          :placeholder="started ? t('ai.followPh') : props.placeholder"
          spellcheck="false"
          @keydown="onKey"
        ></textarea>
      </div>
    </div>

    <template v-if="slots.controls" #inspector>
      <slot name="controls" />
    </template>

    <template #run>
      <button class="btn btn-signal" :disabled="!input.trim() || busy" @click="send">
        <Icon v-if="busy" name="LoaderCircle" class="spin" />
        <Icon v-else name="Play" />
        {{ busy ? t("ai.generating") : started ? t("ai.send") : t("ai.run") }}
        <KbdCombo v-if="!busy" combo="mod+enter" />
      </button>
      <button v-if="busy" class="btn btn-danger" @click="stop">{{ t("ai.stop") }}</button>
      <button v-else-if="output && !busy" class="btn btn-quiet" :disabled="!output" @click="copy">
        <Icon name="Copy" /> {{ t("common.copy") }}
      </button>
    </template>
  </ToolFrame>
</template>

<style scoped>
.grow {
  flex: 1;
  min-width: 0;
}

.chat {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.thread {
  flex: 1;
  min-height: 0;
  padding: 8px 4px 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.empty {
  margin: auto;
  max-width: 420px;
  text-align: center;
}

.turn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 92%;
}

.turn.user {
  align-self: flex-end;
}

.turn.assistant {
  align-self: flex-start;
}

.who {
  font-size: var(--t-xs);
  font-weight: 650;
  color: var(--ink-3);
  padding: 0 4px;
}

.turn.user .who {
  text-align: right;
}

.bubble {
  padding: 10px 12px;
  border-radius: var(--r);
  font-size: var(--t-sm);
  line-height: 1.75;
  user-select: text;
}

.user-body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--f-ui);
  background: var(--acc-wash);
  color: var(--ink);
  border: 1px solid var(--acc-line);
}

.turn.assistant .bubble {
  background: var(--s-2);
  border: 1px solid var(--line);
}

.src {
  min-height: 88px;
  max-height: 220px;
  font-size: var(--t-md);
  line-height: 1.6;
}

.composer {
  flex-shrink: 0;
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

.turn :deep(.md) {
  font-size: var(--t-sm);
  line-height: 1.75;
}

.turn :deep(.md h1),
.turn :deep(.md h2),
.turn :deep(.md h3),
.turn :deep(.md h4) {
  margin: 0.7em 0 0.35em;
  line-height: 1.35;
}

.turn :deep(.md p) {
  margin: 0.4em 0;
}

.turn :deep(.md ul),
.turn :deep(.md ol) {
  margin: 0.4em 0;
  padding-left: 1.4em;
}

.turn :deep(.md code) {
  background: var(--s-3);
  padding: 0.12em 0.35em;
  border-radius: var(--r-sm);
  font-family: var(--f-mono);
  font-size: 0.92em;
}

.turn :deep(.md pre) {
  background: var(--s-3);
  padding: 10px 12px;
  border-radius: var(--r-sm);
  overflow-x: auto;
  margin: 0.5em 0;
}

.turn :deep(.md pre code) {
  background: none;
  padding: 0;
}

.turn :deep(.md table) {
  border-collapse: collapse;
  margin: 0.5em 0;
}

.turn :deep(.md th),
.turn :deep(.md td) {
  border: 1px solid var(--line);
  padding: 5px 9px;
  text-align: left;
}
</style>
