<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import ContextMenu from "../components/ContextMenu.vue";
import { t, lang } from "../lib/i18n";
import { comboText } from "../lib/shortcuts";
import { toolById } from "../lib/tools";
import type { MenuItem } from "../lib/menu";
import {
  closeAll,
  closeOthers,
  closeTab,
  moveTab,
  tabTitle,
  togglePin,
  useTabs,
} from "../stores/tabs";

const router = useRouter();
const { tabs, activePath } = useTabs();

// Titles are translated, so re-derive them when the language flips.
// Category is carried along so each tab can wear its tool's hue.
const items = computed(() => {
  void lang.value;
  return tabs.value.map((tab) => ({
    ...tab,
    title: tabTitle(tab),
    cat: toolById(tab.path.slice(3))?.category ?? "",
  }));
});

const dragFrom = ref(-1);

function onDrop(to: number) {
  if (dragFrom.value >= 0) moveTab(dragFrom.value, to);
  dragFrom.value = -1;
}

/** Middle-click closes, matching every tabbed app. */
function onAux(e: MouseEvent, path: string) {
  if (e.button === 1) {
    e.preventDefault();
    closeTab(path, router);
  }
}

// ---- context menu (shared component, anchored at the pointer) ----
const ctx = ref<{ x: number; y: number; path: string } | null>(null);

const ctxItems = computed<MenuItem[]>(() => {
  const tab = tabs.value.find((x) => x.path === ctx.value?.path);
  if (!tab) return [];
  return [
    {
      id: "pin",
      label: tab.pinned ? t("tabs.unpin") : t("tabs.pin"),
      icon: "Pin",
    },
    { id: "close", label: t("tabs.close"), icon: "X" },
    {
      id: "others",
      label: t("tabs.closeOthers"),
      icon: "Columns2",
      disabled: tabs.value.length < 2,
    },
    { id: "all", label: t("tabs.closeAll"), icon: "Trash2", danger: true },
  ];
});

function openCtx(e: MouseEvent, path: string) {
  e.preventDefault();
  e.stopPropagation();
  ctx.value = { x: e.clientX, y: e.clientY, path };
}

function onCtxSelect(id: string) {
  const path = ctx.value?.path ?? "";
  ctx.value = null;
  if (!path) return;
  if (id === "pin") togglePin(path);
  else if (id === "close") closeTab(path, router);
  else if (id === "others") closeOthers(path, router);
  else if (id === "all") closeAll(router);
}

// ---- overflow dropdown: every tab at a glance once the strip overflows ----
const lane = ref<HTMLElement | null>(null);
const overflowBtn = ref<HTMLElement | null>(null);
const overflowing = ref(false);
const list = ref<{ x: number; y: number } | null>(null);

function measure() {
  const el = lane.value;
  overflowing.value = !!el && el.scrollWidth > el.clientWidth + 2;
}

let ro: ResizeObserver | undefined;
onMounted(() => {
  measure();
  ro = new ResizeObserver(measure);
  if (lane.value) ro.observe(lane.value);
});
onBeforeUnmount(() => ro?.disconnect());
watch(() => items.value.length, () => nextTick(measure));

const listItems = computed<MenuItem[]>(() => {
  void lang.value;
  return [
    ...items.value.map((tab, i) => ({
      id: tab.path,
      label: tab.title,
      icon: tab.icon,
      checked: activePath.value === tab.path,
      detail: i < 9 ? comboText(`mod+${i + 1}`) : undefined,
    })),
    { id: "__close-all__", label: t("tabs.closeAll"), icon: "Trash2", danger: true },
  ];
});

function openList() {
  const r = overflowBtn.value?.getBoundingClientRect();
  if (!r) return;
  list.value = { x: r.left, y: r.bottom + 4 };
}

function onListSelect(id: string) {
  list.value = null;
  if (id === "__close-all__") {
    closeAll(router);
    return;
  }
  router.push(id);
}
</script>

<template>
  <div v-if="items.length" class="strip">
    <div ref="lane" class="lane">
      <!-- TransitionGroup so a closed tab eases out instead of popping -->
      <TransitionGroup name="tab">
        <div
          v-for="(tab, i) in items"
          :key="tab.path"
          class="tab"
          :class="[tab.cat, { on: activePath === tab.path, pinned: tab.pinned }]"
          :title="tab.title"
          draggable="true"
          @click="router.push(tab.path)"
          @auxclick="onAux($event, tab.path)"
          @dragstart="dragFrom = i"
          @dragover.prevent
          @drop.prevent="onDrop(i)"
          @contextmenu="openCtx($event, tab.path)"
        >
          <Icon :name="tab.icon" class="tab-icon" />
          <span class="tab-name">{{ tab.title }}</span>
          <Icon v-if="tab.pinned" name="Pin" class="pin-mark" />
          <button
            v-else
            class="tab-x"
            :title="t('tabs.close')"
            @click.stop="closeTab(tab.path, router)"
          >
            <Icon name="X" />
          </button>
        </div>
      </TransitionGroup>
    </div>

    <button
      v-if="overflowing"
      ref="overflowBtn"
      class="overflow"
      :title="t('tabs.list')"
      @click="openList"
    >
      <Icon name="ChevronDown" />
    </button>

    <button class="all-x" :title="t('tabs.closeAll')" @click="closeAll(router)">
      <Icon name="X" />
    </button>
  </div>

  <ContextMenu
    v-if="ctx"
    :items="ctxItems"
    :x="ctx.x"
    :y="ctx.y"
    @select="onCtxSelect"
    @close="ctx = null"
  />
  <ContextMenu
    v-if="list"
    :items="listItems"
    :x="list.x"
    :y="list.y"
    @select="onListSelect"
    @close="list = null"
  />
</template>

<style scoped>
/* v0.6 Candy tabs: floating pills on the ground; the active one is a
   white card wearing its tool's category hue. */
.strip {
  height: var(--tabs-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px 0 10px;
  background: var(--bg);
  border-bottom: 1px solid var(--line-2);
}

.lane {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.lane::-webkit-scrollbar {
  display: none;
}

.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  max-width: 190px;
  padding: 0 7px 0 11px;
  border-radius: var(--r-sm);
  color: var(--ink-3);
  font-size: var(--t-sm);
  font-weight: 480;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.16s var(--ease), color 0.16s var(--ease),
    box-shadow 0.2s var(--ease-out), transform 0.2s var(--ease-out);
}

.tab:hover:not(.on) {
  background: var(--hover);
  color: var(--ink-2);
}

/* Category hues — same mapping as the sidebar. */
.tab.pdf { --c: var(--cat-pdf); --cb: var(--cat-pdf-bright); }
.tab.image { --c: var(--cat-image); --cb: var(--cat-image-bright); }
.tab.text { --c: var(--cat-text); --cb: var(--cat-text-bright); }
.tab.dev { --c: var(--cat-dev); --cb: var(--cat-dev-bright); }
.tab.calculator { --c: var(--cat-calculator); --cb: var(--cat-calculator-bright); }
.tab.creative { --c: var(--cat-creative); --cb: var(--cat-creative-bright); }
.tab.ai { --c: var(--cat-ai); --cb: var(--cat-ai-bright); }

/* Active pill: floats as a white card, icon and underline wear the
   category colour. */
.tab.on {
  background: var(--s-1);
  color: var(--ink);
  font-weight: 650;
  box-shadow: var(--e-1), inset 0 0 0 1px var(--line-2);
}

.tab.on::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 2px;
  width: 16px;
  height: 3px;
  transform: translateX(-50%);
  border-radius: var(--r-pill);
  background: var(--cb, var(--acc));
}

.tab-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.7;
}

.tab.on .tab-icon {
  opacity: 1;
  color: var(--c, var(--acc));
}

.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-x {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.14s, background 0.14s, color 0.14s;
}

.tab:hover .tab-x,
.tab.on .tab-x {
  opacity: 1;
}

.tab-x:hover {
  background: var(--hover-strong);
  color: var(--ink);
}

.tab-x :deep(svg) {
  width: 11px;
  height: 11px;
}

.pin-mark {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  color: var(--acc);
}

/* Closed tabs fade and lift away while the lane reflows around them. */
.tab-leave-active {
  transition: opacity 0.18s var(--ease-out), transform 0.18s var(--ease-out);
}

.tab-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.tab-move {
  transition: transform 0.18s var(--ease-out);
}

.overflow,
.all-x {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
  transition: background 0.16s var(--ease), color 0.16s var(--ease);
}

.overflow:hover,
.all-x:hover {
  background: var(--acc-wash);
  color: var(--acc);
}

.overflow :deep(svg),
.all-x :deep(svg) {
  width: 14px;
  height: 14px;
}
</style>
