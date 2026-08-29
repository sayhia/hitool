<script setup lang="ts">
/**
 * The one popup menu every surface uses. Renders in a teleport so no
 * ancestor's overflow clips it, flips away from viewport edges, closes on
 * outside click / Esc, and supports arrow-key navigation.
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "./Icon.vue";
import { placeMenu, type MenuItem } from "../lib/menu";

const props = defineProps<{
  items: MenuItem[];
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  (e: "select", id: string): void;
  (e: "close"): void;
}>();

const el = ref<HTMLElement | null>(null);
const pos = ref({ x: props.x, y: props.y });
const cursor = ref(props.items.findIndex((i) => !i.disabled));

onMounted(async () => {
  await nextTick();
  if (el.value) {
    const r = el.value.getBoundingClientRect();
    pos.value = placeMenu(props.x, props.y, r.width, r.height);
  }
  window.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    emit("close");
    return;
  }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const enabled = props.items
      .map((it, i) => ({ it, i }))
      .filter((x) => !x.it.disabled);
    if (!enabled.length) return;
    const at = enabled.findIndex((x) => x.i === cursor.value);
    const step = e.key === "ArrowDown" ? 1 : -1;
    const next = enabled[(at + step + enabled.length) % enabled.length];
    cursor.value = next.i;
    return;
  }
  if (e.key === "Enter") {
    const it = props.items[cursor.value];
    if (it && !it.disabled) {
      e.preventDefault();
      emit("select", it.id);
    }
  }
}

function pick(it: MenuItem) {
  if (it.disabled) return;
  emit("select", it.id);
}
</script>

<template>
  <Teleport to="body">
    <!-- A full-screen veil catches the dismiss click without hiding the app -->
    <div class="veil" @click="emit('close')" @contextmenu.prevent="emit('close')">
      <div
        ref="el"
        class="ctx-menu"
        :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
        role="menu"
        @click.stop
      >
        <button
          v-for="(it, i) in items"
          :key="it.id"
          type="button"
          class="ctx-item"
          :class="{ danger: it.danger, cursor: i === cursor }"
          :disabled="it.disabled"
          role="menuitem"
          @click="pick(it)"
          @mouseenter="cursor = i"
        >
          <Icon v-if="it.icon" :name="it.icon" />
          <span v-else class="ctx-gap" />
          <span class="ctx-label">{{ it.label }}</span>
          <Icon v-if="it.checked" name="Check" class="ctx-check" />
          <span v-else-if="it.detail" class="ctx-detail">{{ it.detail }}</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.veil {
  position: fixed;
  inset: 0;
  z-index: 80;
}

/* macOS menu: translucent panel, small radius, blue selection. */
.ctx-menu {
  position: fixed;
  min-width: 172px;
  max-width: 280px;
  max-height: min(420px, calc(100vh - 16px));
  overflow-y: auto;
  padding: 5px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-lg);
  background: var(--chrome);
  backdrop-filter: blur(28px) saturate(1.8);
  -webkit-backdrop-filter: blur(28px) saturate(1.8);
  box-shadow: var(--e-3);
  display: flex;
  flex-direction: column;
  gap: 1px;
  animation: ctx-in 0.12s var(--ease);
}

@keyframes ctx-in {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 28px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink);
  font-family: var(--f-ui);
  font-size: var(--t-sm);
  font-weight: 450;
  cursor: pointer;
  text-align: left;
}

.ctx-item:hover:not(:disabled),
.ctx-item.cursor:not(:disabled) {
  background: var(--acc-wash-2);
  color: var(--acc);
}

.ctx-item.danger {
  color: var(--fail);
}

.ctx-item.danger:hover:not(:disabled),
.ctx-item.danger.cursor:not(:disabled) {
  background: var(--fail-wash);
  color: var(--fail);
}

.ctx-item:disabled {
  opacity: 0.4;
  cursor: default;
}

.ctx-item :deep(svg) {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

/* Keeps labels aligned on icon-less rows */
.ctx-gap {
  width: 13px;
  flex-shrink: 0;
}

.ctx-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctx-check {
  color: var(--acc);
}

.ctx-item.cursor .ctx-check {
  color: var(--acc-ink);
}

.ctx-detail {
  font-size: var(--t-xs);
  color: var(--ink-4);
}

.ctx-item.cursor .ctx-detail {
  color: color-mix(in srgb, var(--acc) 70%, var(--ink-2));
}
</style>
