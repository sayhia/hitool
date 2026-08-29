<script setup lang="ts">
/**
 * The in-tray. Accepts native drops (the whole tray is a drop target) and the
 * file dialog, keeps order editable for tools where order matters (merge).
 */
import { computed } from "vue";
import { pickFiles, formatBytes } from "../lib/backend";
import { onFilesDropped, partitionByExt, extOf, dragActive, useFileHandoff } from "../lib/drop";
import { t } from "../lib/i18n";
import Icon from "../components/Icon.vue";
import KbdCombo from "../components/KbdCombo.vue";
import type { FileInfo } from "@bindings/hitool/services/models";

const props = withDefaults(
  defineProps<{
    accept?: string[];
    multiple?: boolean;
    /** Show up/down controls — only meaningful when order changes the result. */
    ordered?: boolean;
    disabled?: boolean;
    filterName?: string;
  }>(),
  { accept: () => [], multiple: true, ordered: false, disabled: false, filterName: "Files" },
);

const files = defineModel<FileInfo[]>({ default: () => [] });

const emit = defineEmits<{ (e: "rejected", n: number): void }>();

const patterns = computed(() => props.accept.map((e) => `*.${e}`));

function add(incoming: FileInfo[]) {
  const { taken, rejected } = partitionByExt(incoming, props.accept);
  if (rejected.length) emit("rejected", rejected.length);
  if (!taken.length) return;
  if (props.multiple) {
    const known = new Set(files.value.map((f) => f.path));
    files.value = [...files.value, ...taken.filter((f) => !known.has(f.path))];
  } else {
    files.value = taken.slice(0, 1);
  }
}

onFilesDropped((dropped) => {
  if (props.disabled) return;
  add(dropped);
});

/**
 * Files handed over by another tool's "send to…" or by the landing screen's
 * drop routing. Every tool with a source column renders this component, so
 * handling it here covers all of them at once; the read itself lives in
 * `lib/drop.ts` because the state behind it is one-shot.
 */
useFileHandoff(add);

async function choose() {
  if (props.disabled) return;
  const paths = await pickFiles(
    t("common.selectFiles"),
    props.filterName,
    patterns.value,
    props.multiple,
  );
  if (!paths.length) return;
  const { StatFiles } = await import("@bindings/hitool/services/systemservice");
  add((await StatFiles(paths)) ?? []);
}

function removeAt(i: number) {
  const next = [...files.value];
  next.splice(i, 1);
  files.value = next;
}

function move(i: number, delta: number) {
  const j = i + delta;
  if (j < 0 || j >= files.value.length) return;
  const next = [...files.value];
  [next[i], next[j]] = [next[j], next[i]];
  files.value = next;
}

defineExpose({ choose });
</script>

<template>
  <div class="tray" data-file-drop-target="source">
    <div v-for="(f, i) in files" :key="f.path" class="row">
      <span class="ext">{{ extOf(f.name || f.path) || "?" }}</span>
      <span class="name truncate" :title="f.path">{{ f.name }}</span>
      <span v-if="f.size" class="lab size">{{ formatBytes(f.size) }}</span>

      <template v-if="props.ordered && files.length > 1">
        <button class="mini" :disabled="i === 0" :title="t('bench.moveUp')" @click="move(i, -1)">
          <Icon name="ChevronUp" />
        </button>
        <button
          class="mini"
          :disabled="i === files.length - 1"
          :title="t('bench.moveDown')"
          @click="move(i, 1)"
        >
          <Icon name="ChevronDown" />
        </button>
      </template>

      <button class="mini rm" :title="t('common.clear')" @click="removeAt(i)">
        <Icon name="X" />
      </button>
    </div>

    <button
      class="drop"
      :class="{ hot: dragActive }"
      :disabled="props.disabled"
      @click="choose"
    >
      <Icon name="Plus" />
      <span>{{ files.length ? t("bench.addMore") : t("bench.dropHere") }}</span>
      <KbdCombo combo="mod+o" />
    </button>

    <p v-if="props.accept.length" class="lab accept">
      {{ props.accept.slice(0, 8).join(" · ") }}
    </p>
  </div>
</template>

<style scoped>
.tray {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 7px;
  border-radius: var(--r-sm);
  background: var(--s-1);
  box-shadow: var(--e-1);
  font-size: 12px;
}

.ext {
  font-family: var(--f-mono);
  font-size: 9px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  background: var(--acc-wash);
  color: var(--acc);
  font-weight: 700;
  padding: 2px 5px;
  border-radius: var(--r-pill);
  flex-shrink: 0;
}

.name {
  flex: 1;
  min-width: 0;
}

.size {
  flex-shrink: 0;
  text-transform: none;
}

.mini {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
}

.mini:hover:not(:disabled) {
  background: var(--acc-wash);
  color: var(--acc);
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

.drop {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 10px;
  border: 1.5px dashed var(--line);
  border-radius: var(--r);
  background: transparent;
  color: var(--ink-3);
  font-family: var(--f-ui);
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  transition: all 0.16s var(--ease);
}

.drop:hover:not(:disabled),
.drop.hot {
  border-color: var(--acc);
  background: var(--acc-wash);
  color: var(--acc);
}

.drop:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.drop :deep(svg) {
  width: 13px;
  height: 13px;
}

.drop kbd {
  font-size: 9px;
  padding: 0 3px;
  border-bottom-width: 1px;
}

.accept {
  font-size: 9.5px;
  text-transform: uppercase;
  padding-top: 1px;
  /* .lab is nowrap; a long extension list must wrap rather than clip. */
  white-space: normal;
  line-height: 1.7;
}
</style>
