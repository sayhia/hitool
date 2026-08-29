<script setup lang="ts">
/**
 * HTTP status codes, headers and MIME types.
 *
 * The search runs over the notes as well as the names, because the question
 * people arrive with is "which one means logged in but not allowed" — and the
 * name `403 Forbidden` says none of that.
 */
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import {
  searchHeaders,
  searchMimes,
  searchStatuses,
  statusClass,
  type StatusClass,
} from "../../lib/httpRef";

type Tab = "status" | "header" | "mime";

const tab = ref<Tab>("status");
const query = ref("");
const hidden = ref<Set<StatusClass>>(new Set());

const note = (key: string) => t(`http.${key}`);

const statuses = computed(() =>
  searchStatuses(query.value, note).filter((s) => !hidden.value.has(statusClass(s.code))),
);
const headers = computed(() => searchHeaders(query.value, note));
const mimes = computed(() => searchMimes(query.value));

const count = computed(() =>
  tab.value === "status" ? statuses.value.length : tab.value === "header" ? headers.value.length : mimes.value.length,
);

const CLASSES: StatusClass[] = ["1xx", "2xx", "3xx", "4xx", "5xx"];

function toggleClass(c: StatusClass) {
  const next = new Set(hidden.value);
  if (next.has(c)) next.delete(c);
  else next.add(c);
  hidden.value = next;
}
</script>

<template>
  <ToolFrame tool-id="http-ref" shape="flow">
    <div class="field">
      <span class="lab">{{ t("http.section") }}</span>
      <div class="seg wide">
        <button :class="{ on: tab === 'status' }" @click="tab = 'status'">{{ t("http.tabStatus") }}</button>
        <button :class="{ on: tab === 'header' }" @click="tab = 'header'">{{ t("http.tabHeader") }}</button>
        <button :class="{ on: tab === 'mime' }" @click="tab = 'mime'">{{ t("http.tabMime") }}</button>
      </div>
    </div>

    <div class="field">
      <span class="lab">{{ t("http.search") }}</span>
      <div class="searchbox">
        <Icon name="Search" />
        <input v-model="query" class="input" :placeholder="t('http.searchPh')" spellcheck="false" />
        <button v-if="query" class="clear" :title="t('common.clear')" @click="query = ''">
          <Icon name="X" />
        </button>
      </div>
      <p class="hint">{{ t("http.searchHint") }}</p>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("http.result") }}</span>
        <span class="badge">{{ count }}</span>
      </div>

      <div class="list scroll-y">
        <template v-if="tab === 'status'">
          <button
            v-for="s in statuses"
            :key="s.code"
            class="entry"
            :class="statusClass(s.code)"
            :title="t('common.copy')"
            @click="copyText(`${s.code} ${s.name}`, t('common.copied'))"
          >
            <span class="code mono">{{ s.code }}</span>
            <span class="body">
              <span class="name">{{ s.name }}</span>
              <span class="note">{{ note(s.key) }}</span>
            </span>
          </button>
        </template>

        <template v-else-if="tab === 'header'">
          <button
            v-for="h in headers"
            :key="h.name"
            class="entry"
            :title="t('common.copy')"
            @click="copyText(h.name, t('common.copied'))"
          >
            <span class="body">
              <span class="name mono">{{ h.name }}</span>
              <span class="note">{{ note(h.key) }}</span>
            </span>
          </button>
        </template>

        <template v-else>
          <button
            v-for="m in mimes"
            :key="m.ext + m.mime"
            class="entry mimerow"
            :title="t('common.copy')"
            @click="copyText(m.mime, t('common.copied'))"
          >
            <span class="ext mono">.{{ m.ext }}</span>
            <span class="mime mono">{{ m.mime }}</span>
          </button>
        </template>

        <p v-if="!count" class="hint pad">{{ t("http.none") }}</p>
      </div>
    </template>

    <template #inspector>
      <InspectorSection v-if="tab === 'status'" :title="t('http.filter')" icon="Filter">
        <div class="chips">
          <button
            v-for="c in CLASSES"
            :key="c"
            class="chip"
            :class="{ on: !hidden.has(c) }"
            @click="toggleClass(c)"
          >
            {{ c }}
          </button>
        </div>
      </InspectorSection>

      <InspectorSection :title="t('http.tips')" icon="Lightbulb" :open="true">
        <p class="hint">{{ t("http.tip401") }}</p>
        <p class="hint">{{ t("http.tip307") }}</p>
        <p class="hint">{{ t("http.tip422") }}</p>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
.seg.wide button {
  flex: 1;
}

.searchbox {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.searchbox > :deep(svg) {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  color: var(--ink-4);
  pointer-events: none;
}

.searchbox .input {
  flex: 1;
  padding-left: 32px;
}

.clear {
  position: absolute;
  right: 8px;
  border: 0;
  background: transparent;
  color: var(--ink-4);
  cursor: pointer;
  display: grid;
  place-items: center;
}

.clear :deep(svg) {
  width: 13px;
  height: 13px;
}

.res-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.list {
  flex: 1;
  padding: 6px 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pad {
  padding: 12px 6px;
}

.entry {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 7px 9px;
  border: 0;
  border-left: 3px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.entry:hover {
  background: var(--s-2);
}

/* The class of a status is the first thing you read off it. */
.entry.\32 xx {
  border-left-color: var(--ok);
}

.entry.\33 xx {
  border-left-color: var(--acc);
}

.entry.\34 xx {
  border-left-color: var(--warn);
}

.entry.\35 xx {
  border-left-color: var(--fail);
}

.code {
  font-size: var(--t-md);
  color: var(--ink);
  min-width: 40px;
  flex-shrink: 0;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name {
  font-size: var(--t-sm);
  color: var(--ink);
}

.note {
  font-size: var(--t-xs);
  color: var(--ink-3);
  line-height: 1.5;
}

.mimerow {
  align-items: baseline;
}

.ext {
  min-width: 68px;
  color: var(--acc);
  font-size: var(--t-sm);
  flex-shrink: 0;
}

.mime {
  font-size: var(--t-sm);
  color: var(--ink);
  word-break: break-all;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
</style>
