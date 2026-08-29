<script setup lang="ts">
/**
 * Full-height source list. Expanded it maps home, favorites, and the
 * seven categories; opening a tool nests that category's siblings
 * underneath so you can jump without going back to the grid. Collapsed
 * it is a true icon rail. On macOS the brand row clears the traffic
 * lights and is the window-drag region.
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { CATEGORIES, toolsInCategory, toolById, uniqueTools, type CategoryId } from "../lib/tools";
import { t, lang } from "../lib/i18n";
import { inWails } from "../lib/backend";
import { sidebarOpen } from "../stores/sidebar";
import * as StoreService from "@bindings/hitool/services/storeservice";
import Icon from "../components/Icon.vue";
import BrandLogo from "../components/BrandLogo.vue";
import { isMacUi } from "../lib/platform";

const route = useRoute();
const router = useRouter();

const items = computed(() => {
  void lang.value;
  return CATEGORIES.map((c, i) => ({
    id: c.id,
    icon: c.icon,
    label: t(`nav.${c.id}`),
    path: `/c/${c.id}`,
    key: String(i + 1),
  }));
});

/** Category of the current page — a /c/ route or the tool's own category. */
const activeCat = computed<CategoryId | "">(() => {
  const p = route.path;
  if (p.startsWith("/c/")) return (p.slice(3) as CategoryId) || "";
  if (p.startsWith("/t/")) return toolById(p.slice(3))?.category ?? "";
  return "";
});

const isHome = computed(() => route.path === "/");
const isCatPage = (path: string) => route.path === path || route.path.startsWith(`${path}/`);
const onTool = computed(() => route.path.startsWith("/t/"));
const isMac = isMacUi();

/** Sibling tools belong under a category only while a tool is open —
 *  the category page already shows the same set as cards. */
function showKids(id: CategoryId) {
  return sidebarOpen.value && onTool.value && activeCat.value === id;
}

const catTools = computed(() => {
  void lang.value;
  if (!activeCat.value) return [];
  return toolsInCategory(activeCat.value).map((x) => ({
    id: x.id,
    icon: x.icon,
    label: t(`tools.${x.id}.name`),
  }));
});

const favorites = ref<string[]>([]);

async function loadFavs() {
  if (!inWails()) return;
  try {
    favorites.value = (await StoreService.GetFavorites()) ?? [];
  } catch {
    favorites.value = [];
  }
}

onMounted(loadFavs);
watch(() => route.path, loadFavs);

const favTools = computed(() => {
  void lang.value;
  return uniqueTools(favorites.value)
    .slice(0, 6)
    .map((x) => ({ id: x.id, icon: x.icon, label: t(`tools.${x.id}.name`) }));
});
</script>

<template>
  <aside class="side" :class="{ open: sidebarOpen, mac: isMac }">
    <div class="brand">
      <BrandLogo named :size="32" />
    </div>

    <nav class="nav">
      <!-- Shown only in the macOS icon rail, under the traffic-light row. -->
      <BrandLogo class="rail-logo" :size="32" />

      <button
        type="button"
        class="item home"
        :class="{ on: isHome }"
        :title="t('nav.home')"
        @click="router.push('/')"
      >
        <span class="ico"><Icon name="House" /></span>
        <span class="txt">{{ t("nav.home") }}</span>
      </button>

      <section v-if="favTools.length" class="sec favs">
        <div class="sec-h">{{ t("common.favorites") }}</div>
        <button
          v-for="tool in favTools"
          :key="`fav-${tool.id}`"
          type="button"
          class="item fav"
          :class="{ on: route.path === `/t/${tool.id}` }"
          :title="tool.label"
          @click="router.push(`/t/${tool.id}`)"
        >
          <span class="ico"><Icon :name="tool.icon" /></span>
          <span class="txt">{{ tool.label }}</span>
        </button>
      </section>

      <section class="sec">
        <div v-if="favTools.length" class="sec-h">{{ t("common.categories") }}</div>
        <div
          v-for="item in items"
          :key="item.id"
          class="block"
          :class="item.id"
        >
          <button
            type="button"
            class="item cat"
            :class="{ on: isCatPage(item.path), cur: activeCat === item.id }"
            :title="`${item.label}  ${item.key}`"
            @click="router.push(item.path)"
          >
            <span class="ico"><Icon :name="item.icon" /></span>
            <span class="txt">{{ item.label }}</span>
          </button>

          <div v-if="showKids(item.id)" class="kids">
            <button
              v-for="tool in catTools"
              :key="tool.id"
              type="button"
              class="item kid"
              :class="{ on: route.path === `/t/${tool.id}` }"
              :title="tool.label"
              @click="router.push(`/t/${tool.id}`)"
            >
              <span class="ico"><Icon :name="tool.icon" /></span>
              <span class="txt">{{ tool.label }}</span>
            </button>
          </div>
        </div>
      </section>
    </nav>
  </aside>
</template>

<style scoped>
/* Quiet source list: category colour lives on the icon and the
   selection wash, not on a stack of candy plates. */
.side {
  --mac-lights-w: 86px;
  width: var(--rail-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--chrome);
  backdrop-filter: blur(var(--chrome-blur)) saturate(1.5);
  -webkit-backdrop-filter: blur(var(--chrome-blur)) saturate(1.5);
  border-right: 1px solid var(--line-2);
  transition: width 0.24s var(--ease-out);
}

.side.open {
  width: var(--side-w);
}

.brand {
  min-height: var(--bar-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line-2);
  --wails-draggable: drag;
}

.brand :deep(.brand-logo) {
  flex: 1;
  min-width: 0;
}

.nav {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 8px 16px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
}

.sec {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sec + .sec,
.home + .sec {
  margin-top: 10px;
}

.sec-h {
  padding: 8px 8px 5px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.02em;
  color: var(--ink-4);
  overflow: hidden;
  white-space: nowrap;
}

.block {
  display: flex;
  flex-direction: column;
}

.block.pdf { --c: var(--cat-pdf); }
.block.image { --c: var(--cat-image); }
.block.text { --c: var(--cat-text); }
.block.dev { --c: var(--cat-dev); }
.block.calculator { --c: var(--cat-calculator); }
.block.creative { --c: var(--cat-creative); }
.block.ai { --c: var(--cat-ai); }

.item.home { --c: var(--acc); }
.item.fav { --c: var(--warn); }

.item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 34px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--r);
  background: transparent;
  color: var(--ink-2);
  font-family: var(--f-ui);
  font-size: 13px;
  font-weight: 550;
  letter-spacing: -0.01em;
  cursor: pointer;
  text-align: left;
  transition: background 0.14s var(--ease), color 0.14s var(--ease);
}

.item:hover:not(.on) {
  background: var(--hover);
  color: var(--ink);
}

.item.on {
  background: color-mix(in srgb, var(--c, var(--acc)) 13%, transparent);
  color: var(--ink);
  font-weight: 650;
}

.item.cur:not(.on) {
  color: var(--ink);
}

.item.cat .ico,
.item.cur .ico,
.item.cat.on .ico {
  color: var(--c);
}

.item.home .ico {
  color: var(--acc);
}

.item.fav .ico {
  color: var(--warn);
}

.ico {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.ico :deep(svg) {
  width: 16px;
  height: 16px;
}

.txt {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Same source-list row as favorites — only the icon column is
   indented so kids sit under the category label, not in a tree. */
.kids {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0 0 6px;
  padding: 0;
}

.kid {
  height: 32px;
  padding: 0 8px 0 36px;
  font-size: 13px;
  font-weight: 550;
  border-radius: var(--r-sm);
}

.kid .ico :deep(svg) {
  width: 15px;
  height: 15px;
  color: var(--ink-3);
}

.kid.on .ico :deep(svg) {
  color: var(--c);
}

/* ---- collapsed icon rail ---- */
.side:not(.open) .brand {
  justify-content: center;
  padding: 0;
}

.side:not(.open) .brand :deep(.meta),
.side:not(.open) .txt,
.side:not(.open) .sec-h,
.side:not(.open) .kids,
.side:not(.open) .favs {
  display: none;
}

.side:not(.open) .nav {
  padding: 6px 8px 12px;
  align-items: center;
}

.side:not(.open) .sec {
  width: 100%;
  align-items: center;
}

.side:not(.open) .block {
  width: 100%;
  align-items: center;
}

.rail-logo {
  display: none;
  width: 40px;
  height: 40px;
  place-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-bottom: 6px;
  padding: 4px;
}

.side:not(.open) .item {
  width: 40px;
  height: 40px;
  justify-content: center;
  padding: 0;
  border-radius: var(--r);
}

.side:not(.open) .ico :deep(svg) {
  width: 18px;
  height: 18px;
}

/* macOS traffic lights overlay the top-left of the webview.
   Expanded: mark sits to the right of the cluster, same 54px band
   as the command bar. Rail: keep that band as a lights-only spacer
   so hairlines line up, and put the mark in the nav underneath. */
.side.mac.open .brand {
  padding-left: var(--mac-lights-w);
}

.side.mac:not(.open) .brand :deep(.brand-logo) {
  display: none;
}

.side.mac:not(.open) .rail-logo {
  display: grid;
}

.side.mac:not(.open) .item.home {
  display: none;
}

/* Narrow windows force the rail look regardless of the stored state. */
@media (max-width: 1180px) {
  .side,
  .side.open {
    width: var(--rail-w);
  }

  .side .brand {
    justify-content: center;
    padding: 0;
  }

  .side .brand :deep(.meta),
  .side .txt,
  .side .sec-h,
  .side .kids,
  .side .favs {
    display: none;
  }

  .side .nav {
    padding: 6px 8px 12px;
    align-items: center;
  }

  .side .sec,
  .side .block {
    width: 100%;
    align-items: center;
  }

  .side .item {
    width: 40px;
    height: 40px;
    justify-content: center;
    padding: 0;
    border-radius: var(--r);
  }

  .side .ico :deep(svg) {
    width: 18px;
    height: 18px;
  }

  .side.mac .brand {
    padding-left: 0;
  }

  .side.mac .brand :deep(.brand-logo) {
    display: none;
  }

  .side.mac .rail-logo {
    display: grid;
  }

  .side.mac .item.home {
    display: none;
  }
}
</style>
