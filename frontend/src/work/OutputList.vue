<script setup lang="ts">
/** The out-tray: what actually came out, with before/after and where it went. */
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { openFolder, revealFile } from "../lib/backend";
import { t, lang } from "../lib/i18n";
import { elapsedText, etaText, type Job } from "../stores/jobs";
import { copyText } from "../stores/toast";
import { IMAGE_EXT, toolsAccepting } from "../lib/tools";
import { extOf, handoffState } from "../lib/drop";
import ContextMenu from "../components/ContextMenu.vue";
import type { MenuItem } from "../lib/menu";
import * as ImageService from "@bindings/hitool/services/imageservice";
import type { FileInfo } from "@bindings/hitool/services/models";
import Icon from "../components/Icon.vue";

const props = defineProps<{ job?: Job }>();
const router = useRouter();

// ---- thumbnails ----
// Image outputs get a tiny preview so the tray is scannable at a glance.
// "" means requested-but-skipped (huge source, decode error) — don't retry.
const thumbs = ref<Record<string, string>>({});

watch(
  () => props.job?.outputs,
  (outs) => {
    for (const out of outs ?? []) {
      if (!out.ok || out.path in thumbs.value) continue;
      if (!IMAGE_EXT.includes(extOf(out.path))) continue;
      thumbs.value[out.path] = "";
      ImageService.Thumbnail(out.path, 96)
        .then((u) => {
          if (u) thumbs.value[out.path] = u;
        })
        .catch(() => {});
    }
  },
  { immediate: true, deep: true },
);

// ---- chaining ----
// A produced file is rarely the end of the road; offer the tools that accept
// it so "extract audio → convert → trim" doesn't mean re-picking files.
const chain = ref<{ x: number; y: number; path: string } | null>(null);

const chainItems = computed<MenuItem[]>(() => {
  void lang.value;
  if (!chain.value) return [];
  return toolsAccepting(extOf(chain.value.path)).map((tool) => ({
    id: tool.id,
    label: t(`tools.${tool.id}.name`),
    icon: tool.icon,
  }));
});

function openChain(e: MouseEvent, path: string) {
  chain.value = { x: e.clientX, y: e.clientY, path };
}

function onChainSelect(toolId: string) {
  const out = props.job?.outputs.find((o) => o.path === chain.value?.path);
  chain.value = null;
  if (!out) return;
  router.push({
    path: `/t/${toolId}`,
    state: handoffState([{ path: out.path, name: out.name, size: 0 } as FileInfo]) as never,
  });
}
</script>

<template>
  <div v-if="!props.job" class="idle">
    <Icon name="Inbox" />
    <p class="hint">{{ t("bench.outputIdle") }}</p>
  </div>

  <template v-else>
    <div v-if="props.job.state === 'running'" class="stripe run running">
      <div class="line">
        <span class="truncate">{{ props.job.activeFile || props.job.label }}</span>
        <span class="lab">{{ elapsedText(props.job) }}</span>
      </div>
      <span class="track">
        <span class="fill" :style="{ width: props.job.progress * 100 + '%' }" />
      </span>
      <span class="lab eta-line">
        <template v-if="props.job.total > 1">{{ props.job.current }}/{{ props.job.total }} · </template>
        <template v-if="etaText(props.job)">{{ t("dock.eta", { t: etaText(props.job) }) }}</template>
      </span>
    </div>

    <div v-if="props.job.state === 'failed'" class="stripe fail">
      <div class="line">
        <strong>{{ t("common.failed") }}</strong>
      </div>
      <p class="err">{{ props.job.error }}</p>
    </div>

    <div v-for="out in props.job.outputs" :key="out.path" class="outwrap">
      <button class="stripe out" :class="out.ok ? 'ok' : 'fail'" @click="revealFile(out.path)">
        <div class="line">
          <img v-if="thumbs[out.path]" class="thumb" :src="thumbs[out.path]" alt="" />
          <span class="truncate name">{{ out.name }}</span>
          <Icon name="FolderOpen" class="reveal" />
        </div>
        <span class="lab detail">{{ out.detail }}</span>
      </button>

      <div class="out-actions">
        <button
          class="mini"
          :title="t('bench.copyPath')"
          @click.stop="copyText(out.path, t('common.copied'))"
        >
          <Icon name="Copy" />
        </button>
        <button
          v-if="out.ok && toolsAccepting(extOf(out.path)).length"
          class="mini"
          :title="t('bench.sendTo')"
          @click.stop="openChain($event, out.path)"
        >
          <Icon name="Forward" />
        </button>
      </div>
    </div>

    <ContextMenu
      v-if="chain"
      :items="chainItems"
      :x="chain.x"
      :y="chain.y"
      @select="onChainSelect"
      @close="chain = null"
    />

    <button
      v-if="props.job.state === 'done' && props.job.outputDir && props.job.outputs.length > 1"
      class="btn btn-sm"
      @click="openFolder(props.job.outputDir)"
    >
      <Icon name="FolderOpen" /> {{ t("common.openFolder") }}
    </button>
  </template>
</template>

<style scoped>
.outwrap {
  position: relative;
}

.thumb {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  object-fit: cover;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
}

.out-actions {
  position: absolute;
  top: 7px;
  right: 7px;
  display: flex;
  gap: 5px;
  opacity: 0;
  transition: opacity 0.14s;
}

.outwrap:hover .out-actions {
  opacity: 1;
}

.mini {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--s-1);
  color: var(--ink-3);
  cursor: pointer;
  transition: color 0.14s, border-color 0.14s;
}

.mini:hover {
  color: var(--acc);
  border-color: var(--acc-line);
}

.mini :deep(svg) {
  width: 13px;
  height: 13px;
}

.eta-line {
  text-transform: none;
  letter-spacing: 0.03em;
}

.idle {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--ink-3);
  padding: 24px 12px;
  text-align: center;
}

.idle :deep(svg) {
  width: 22px;
  height: 22px;
  opacity: 0.55;
}

.running {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.line .lab {
  margin-left: auto;
  text-transform: none;
}

.out {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  text-align: left;
  cursor: pointer;
  font-family: var(--f-ui);
  color: var(--ink);
}

.out:hover {
  border-color: var(--ink-3);
}

.out:hover .reveal {
  opacity: 1;
}

.name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
}

.reveal {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  opacity: 0;
  color: var(--ink-3);
  transition: opacity 0.12s;
}

.detail {
  text-transform: none;
  letter-spacing: 0.03em;
}

.err {
  font-family: var(--f-mono);
  font-size: 10.5px;
  color: var(--fail);
  word-break: break-word;
  max-height: 140px;
  overflow-y: auto;
  user-select: text;
}
</style>
