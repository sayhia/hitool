<script setup lang="ts">
/**
 * The one navigator: a single tree listing every tool — favourites, then
 * each category with its tools inline. A filter box at the top flattens the
 * tree to matches as you type, which is the fastest path to any tool when
 * you know its name; ⌘K stays the semantic path (actions, outputs).
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { CATEGORIES, TOOLS, canonicalToolId, toolById, toolsInCategory, uniqueTools, type CategoryId } from "../lib/tools";
import { t, lang } from "../lib/i18n";
import { inWails } from "../lib/backend";
import { focusedCat } from "../stores/sidebar";
import { openSettings } from "../stores/settings";
import { theme, cycleTheme } from "../lib/theme";
import * as StoreService from "@bindings/hitool/services/storeservice";
import Icon from "../components/Icon.vue";
import BrandLogo from "../components/BrandLogo.vue";
import UpdateButton from "../components/UpdateButton.vue";

const route = useRoute();
const router = useRouter();

const filter = ref("");
const collapsed = ref<Set<CategoryId>>(new Set());
const favorites = ref<string[]>([]);

const activeCat = computed<CategoryId | "">(() => {
  const p = route.path;
  if (p.startsWith("/c/")) return (p.slice(3) as CategoryId) || "";
  if (p.startsWith("/t/")) return toolById(canonicalToolId(p.slice(3)))?.category ?? "";
  return "";
});

const activeTool = computed(() => {
  const p = route.path;
  return p.startsWith("/t/") ? canonicalToolId(p.slice(3)) : "";
});

const name = (id: string) => {
  void lang.value;
  return t(`tools.${id}.name`);
};

/** Flat match list while filtering; groups otherwise. */
const matches = computed(() => {
  void lang.value;
  const q = filter.value.trim().toLowerCase();
  if (!q) return [];
  return TOOLS.filter(
    (tool) =>
      t(`tools.${tool.id}.name`).toLowerCase().includes(q) ||
      tool.id.includes(q) ||
      t(`tools.${tool.id}.desc`).toLowerCase().includes(q),
  ).map((tool) => ({ id: tool.id, icon: tool.icon, label: name(tool.id), cat: tool.category }));
});

const favTools = computed(() => {
  void lang.value;
  return uniqueTools(favorites.value).map((x) => ({ id: x.id, icon: x.icon, label: name(x.id) }));
});

function toggleCat(id: CategoryId) {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}

function isOpen(id: CategoryId) {
  return !collapsed.value.has(id) || activeCat.value === id || focusedCat.value === id;
}

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

// Number keys land here: reveal and scroll to the requested category.
watch(focusedCat, (id) => {
  if (!id) return;
  collapsed.value = new Set([...collapsed.value].filter((c) => c !== id));
  requestAnimationFrame(() => {
    document.querySelector(`[data-cat="${id}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  });
});

const themeIcon = computed(() =>
  theme.value === "dark" ? "Moon" : theme.value === "light" ? "Sun" : "SunMoon",
);
</script>

<template>
  <aside class="tree">
    <div class="brand">
      <BrandLogo :size="26" />
    </div>

    <div class="filter">
      <Icon name="Search" class="f-ico" />
      <input
        v-model="filter"
        class="f-in"
        :placeholder="t('cmd.placeholder')"
        spellcheck="false"
      />
      <button v-if="filter" class="f-x" :title="t('common.clear')" @click="filter = ''">
        <Icon name="X" />
      </button>
    </div>

    <nav class="body scroll-y">
      <!-- Filtering: one flat list of hits across the whole catalogue. -->
      <template v-if="filter">
        <button
          v-for="m in matches"
          :key="m.id"
          type="button"
          class="row"
          :class="{ on: activeTool === m.id }"
          @click="router.push(`/t/${m.id}`); filter = ''"
        >
          <span class="ico" :class="m.cat"><Icon :name="m.icon" /></span>
          <span class="txt truncate">{{ m.label }}</span>
        </button>
        <p v-if="!matches.length" class="hint pad">{{ t("common.noResults") }}</p>
      </template>

      <template v-else>
        <section v-if="favTools.length" class="grp">
          <div class="g-h">{{ t("common.favorites") }}</div>
          <button
            v-for="tool in favTools"
            :key="`fav-${tool.id}`"
            type="button"
            class="row"
            :class="{ on: activeTool === tool.id }"
            :title="tool.label"
            @click="router.push(`/t/${tool.id}`)"
          >
            <span class="ico fav"><Icon :name="tool.icon" /></span>
            <span class="txt truncate">{{ tool.label }}</span>
          </button>
        </section>

        <section
          v-for="c in CATEGORIES"
          :key="c.id"
          class="grp"
          :data-cat="c.id"
        >
          <button
            type="button"
            class="g-btn"
            :class="[c.id, { open: isOpen(c.id), on: activeCat === c.id }]"
            @click="toggleCat(c.id)"
          >
            <Icon name="ChevronRight" class="caret" />
            <span class="ico" :class="c.id"><Icon :name="c.icon" /></span>
            <span class="txt truncate">{{ t(`nav.${c.id}`) }}</span>
            <span class="lab n">{{ toolsInCategory(c.id).length }}</span>
          </button>

          <div v-if="isOpen(c.id)" class="kids">
            <button
              v-for="tool in toolsInCategory(c.id)"
              :key="tool.id"
              type="button"
              class="row kid"
              :class="{ on: activeTool === tool.id }"
              :title="name(tool.id)"
              @click="router.push(`/t/${tool.id}`)"
            >
              <span class="ico"><Icon :name="tool.icon" /></span>
              <span class="txt truncate">{{ name(tool.id) }}</span>
              <Icon v-if="favorites.includes(tool.id)" name="Star" class="stared" />
            </button>
          </div>
        </section>
      </template>
    </nav>

    <div class="foot">
      <UpdateButton />
      <button class="f-btn" :title="t('settings.theme')" @click="cycleTheme">
        <Icon :name="themeIcon" />
      </button>
      <button class="f-btn" :title="t('nav.settings')" @click="openSettings()">
        <Icon name="Settings2" />
      </button>
    </div>
  </aside>
</template>

<style scoped>
.tree {
  width: var(--side-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--chrome);
  backdrop-filter: blur(var(--chrome-blur));
  -webkit-backdrop-filter: blur(var(--chrome-blur));
  border-right: 1px solid var(--line);
}

.brand {
  min-height: var(--tabs-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 7px 12px;
  border-bottom: 1px solid var(--line-2);
  --wails-draggable: drag;
}

.filter {
  margin: 10px 12px 6px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--s-1);
  transition: border-color 0.16s var(--ease);
}

.filter:focus-within {
  border-color: var(--primary);
}

.f-ico {
  width: 13px;
  height: 13px;
  color: var(--ink-3);
  flex-shrink: 0;
}

.f-in {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--ink);
  font-family: var(--f-ui);
  font-size: var(--t-sm);
}

.f-in::placeholder {
  color: var(--ink-4);
}

.f-x {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
}

.f-x svg {
  width: 11px;
  height: 11px;
}

.body {
  flex: 1;
  min-height: 0;
  padding: 4px 10px 12px;
}

.grp {
  margin-bottom: 10px;
}

.g-h,
.g-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 5px 7px;
  border: 0;
  font-family: var(--f-ui);
  text-align: left;
}

.g-h {
  font-size: var(--t-xs);
  font-weight: 650;
  letter-spacing: 0.02em;
  color: var(--ink-4);
}

.g-btn {
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--ink-2);
  font-size: var(--t-sm);
  font-weight: 650;
  cursor: pointer;
}

.g-btn:hover {
  background: var(--hover);
}

.caret {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  color: var(--ink-4);
  transition: transform 0.16s var(--ease-out);
}

.g-btn.open .caret {
  transform: rotate(90deg);
}

.g-btn .ico,
.g-btn .txt {
  color: var(--ink);
}

.g-btn .ico {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.g-btn .ico svg {
  width: 15px;
  height: 15px;
}

.ico.pdf { color: var(--cat-pdf); }
.ico.image { color: var(--cat-image); }
.ico.text { color: var(--cat-text); }
.ico.dev { color: var(--cat-dev); }
.ico.calculator { color: var(--cat-calculator); }
.ico.creative { color: var(--cat-creative); }
.ico.fav { color: var(--warn); }

.g-btn.on {
  background: var(--secondary-container);
}

.g-btn.on .ico,
.g-btn.on .txt {
  color: var(--on-secondary-container);
}

.n {
  margin-left: auto;
  flex-shrink: 0;
}

.kids {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 2px 0 4px;
  padding-left: 14px;
  border-left: 1px solid var(--line-2);
  margin-left: 13px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--ink-2);
  font-family: var(--f-ui);
  font-size: var(--t-sm);
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s var(--ease), color 0.12s var(--ease);
}

.row:hover:not(.on) {
  background: var(--hover);
  color: var(--ink);
}

.row.on {
  background: var(--secondary-container);
  color: var(--on-secondary-container);
  font-weight: 650;
}

.row .ico {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ink-3);
}

.row .ico svg {
  width: 14px;
  height: 14px;
}

.row.on .ico {
  color: var(--on-secondary-container);
}

.row .txt {
  flex: 1;
  min-width: 0;
}

.stared {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  color: var(--warn);
}

.pad {
  padding: 10px 8px;
}

.foot {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  border-top: 1px solid var(--line-2);
}

.f-btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
}

.f-btn:hover {
  background: var(--hover);
  color: var(--ink);
}

.f-btn svg {
  width: 15px;
  height: 15px;
}

.foot :deep(.update) {
  margin-right: auto;
}
</style>
