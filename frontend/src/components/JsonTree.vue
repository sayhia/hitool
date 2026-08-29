<script setup lang="ts">
/**
 * Collapsible JSON tree. Renders itself recursively; each object/array node
 * owns its own expanded state so collapsing a branch is local and cheap.
 */
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    label?: string;
    value: unknown;
    depth?: number;
    /** Branches deeper than this start collapsed. */
    autoCollapseFrom?: number;
    last?: boolean;
  }>(),
  { depth: 0, autoCollapseFrom: 3, last: true },
);

const kind = computed(() => {
  const v = props.value;
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
});

const isBranch = computed(() => kind.value === "array" || kind.value === "object");

const open = ref(props.depth < props.autoCollapseFrom);

const entries = computed<[string, unknown][]>(() => {
  if (!isBranch.value) return [];
  const v = props.value;
  if (Array.isArray(v)) return v.map((x, i) => [String(i), x]);
  return Object.entries(v as Record<string, unknown>);
});

/** "{3}" / "[12]" — the size hint shown when a branch is collapsed. */
const summary = computed(() =>
  kind.value === "array" ? `[${entries.value.length}]` : `{${entries.value.length}}`,
);

const scalar = computed(() => {
  switch (kind.value) {
    case "string":
      return JSON.stringify(props.value);
    case "null":
      return "null";
    default:
      return String(props.value);
  }
});
</script>

<template>
  <div class="node" :style="{ '--d': props.depth }">
    <div class="line" :class="{ branch: isBranch }" @click="isBranch && (open = !open)">
      <span v-if="isBranch" class="caret" :class="{ open }">▸</span>
      <span v-else class="caret spacer"></span>

      <span v-if="props.label !== undefined" class="key">{{ props.label }}</span>
      <span v-if="props.label !== undefined" class="colon">:</span>

      <template v-if="isBranch">
        <span class="brace">{{ kind === "array" ? "[" : "{" }}</span>
        <span v-if="!open" class="size">{{ entries.length }}</span>
        <span v-if="!open" class="brace">{{ kind === "array" ? "]" : "}" }}</span>
        <span v-if="open" class="size dim">{{ summary }}</span>
      </template>
      <span v-else class="val" :class="kind">{{ scalar }}</span>

      <span v-if="!isBranch && !props.last" class="comma">,</span>
    </div>

    <div v-if="isBranch && open" class="kids">
      <JsonTree
        v-for="([k, v], i) in entries"
        :key="k"
        :label="k"
        :value="v"
        :depth="props.depth + 1"
        :auto-collapse-from="props.autoCollapseFrom"
        :last="i === entries.length - 1"
      />
      <div class="line closing">
        <span class="caret spacer"></span>
        <span class="brace">{{ kind === "array" ? "]" : "}" }}</span>
        <span v-if="!props.last" class="comma">,</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.node {
  font-family: var(--f-mono);
  font-size: 12px;
  line-height: 1.65;
}

.line {
  display: flex;
  align-items: baseline;
  gap: 3px;
  padding-left: calc(var(--d) * 13px);
  white-space: nowrap;
  border-radius: 2px;
}

.line.branch {
  cursor: pointer;
}

.line.branch:hover {
  background: var(--s-3);
}

.caret {
  width: 11px;
  flex-shrink: 0;
  color: var(--ink-3);
  font-size: 9px;
  transition: transform 0.12s ease;
  display: inline-block;
}

.caret.open {
  transform: rotate(90deg);
}

.caret.spacer {
  visibility: hidden;
}

.key {
  color: var(--ink);
  font-weight: 600;
}

.colon,
.comma,
.brace {
  color: var(--ink-3);
}

.size {
  color: var(--ink-3);
  font-size: 10.5px;
  padding: 0 3px;
}

.size.dim {
  opacity: 0;
}

/* Value colours carry type, not decoration — one hue per JSON primitive. */
.val.string {
  color: var(--ok);
}

.val.number {
  color: var(--acc);
}

.val.boolean {
  color: var(--warn);
}

.val.null {
  color: var(--ink-3);
  font-style: italic;
}

.kids {
  display: flex;
  flex-direction: column;
}
</style>
