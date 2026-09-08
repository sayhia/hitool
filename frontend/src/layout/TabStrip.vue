<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import ContextMenu from "../components/ContextMenu.vue";
import { t, lang } from "../lib/i18n";
import { comboText } from "../lib/shortcuts";
import { toolById } from "../lib/tools";
import { useRoute } from "vue-router";
import { sidebarOpen, setSidebar } from "../stores/sidebar";
import { inspectorHasContent, inspectorOpen, toggleInspector } from "../stores/inspector";

const route = useRoute();
const showInspector = computed(
  () => route.path.startsWith("/t/") && inspectorHasContent.value,
);
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
  <header class="strip">
    <!-- Only visible while the sidebar is collapsed: the one way back. -->
    <button
      v-if="!sidebarOpen"
      class="tb"
      :title="t('nav.expand')"
      @click="setSidebar(true)"
    >
      <Icon name="PanelLeft" />
    </button>

    <div ref="lane" class="lane">
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
      class="tb overflow"
      :title="t('tabs.list')"
      @click="openList"
    >
      <Icon name="ChevronDown" />
    </button>

    <button v-if="items.length" class="tb" :title="t('tabs.closeAll')" @click="closeAll(router)">
      <Icon name="X" />
    </button>

    <div class="cluster">
      <button
        v-if="showInspector"
        class="tb"
        :class="{ on: inspectorOpen }"
        :title="t('common.inspector')"
        @click="toggleInspector"
      >
        <Icon name="PanelRight" />
      </button>
    </div>
  </header>

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
/* The canvas header: window drag zone, tab lane and the contextual
   controls in one 40px strip. Tabs are quiet text with an underline
   accent — no pills, no cards. */
.strip {
  height: var(--tabs-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  background: var(--s-1);
  border-bottom: 1px solid var(--line);
  --wails-draggable: drag;
}

.tb {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
  --wails-draggable: no-drag;
}

.tb:hover {
  background: var(--hover);
  color: var(--ink);
}

.tb.on {
  background: var(--acc-wash);
  color: var(--acc);
}

.tb svg {
  width: 15px;
  height: 15px;
}

.lane {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  flex: 0 1 auto;
  overflow-x: auto;
  scrollbar-width: none;
  --wails-draggable: no-drag;
}

.lane::-webkit-scrollbar {
  display: none;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  height: var(--tabs-h);
  padding: 0 9px;
  max-width: 190px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ink-3);
  font-family: var(--f-ui);
  font-size: var(--t-sm);
  font-weight: 550;
  cursor: pointer;
  flex-shrink: 0;
  user-select: none;
}

.tab:hover {
  color: var(--ink);
  background: var(--hover);
}

.tab.on {
  color: var(--ink);
  font-weight: 650;
  border-bottom-color: var(--acc);
}

.tab-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: var(--ink-4);
}

.tab.on .tab-icon {
  color: var(--acc);
}

.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pin-mark {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  color: var(--ink-4);
}

.tab-x {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-4);
  cursor: pointer;
  opacity: 0;
  flex-shrink: 0;
}

.tab:hover .tab-x,
.tab.on .tab-x {
  opacity: 1;
}

.tab-x:hover {
  background: var(--hover-strong);
  color: var(--ink);
}

.tab-x svg {
  width: 10px;
  height: 10px;
}

.cluster {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
  --wails-draggable: no-drag;
}

/* tab close/switch motion */
.tab-enter-active,
.tab-leave-active {
  transition: opacity 0.15s var(--ease), transform 0.15s var(--ease-out);
}

.tab-enter-from,
.tab-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>