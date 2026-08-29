<script setup lang="ts">
/**
 * The landing screen is a drop target first and a menu second: throw a file at
 * it and it answers with the tools that can act on that file.
 */
import { computed, onMounted, ref, type CSSProperties } from "vue";
import { useRouter } from "vue-router";
import { CATEGORIES, TOOLS, toolsAccepting, toolsInCategory, toolById, uniqueTools } from "../lib/tools";
import { t, lang } from "../lib/i18n";
import { inWails, formatBytes } from "../lib/backend";
import { onFilesDropped, extOf, dragActive, handoffState } from "../lib/drop";
import * as StoreService from "@bindings/hitool/services/storeservice";
import type { FileInfo } from "@bindings/hitool/services/models";
import Icon from "../components/Icon.vue";
import KbdCombo from "../components/KbdCombo.vue";

const router = useRouter();
const favorites = ref<string[]>([]);
const recentIds = ref<string[]>([]);
const dropped = ref<FileInfo[]>([]);

onMounted(async () => {
  if (!inWails()) return;
  try {
    favorites.value = (await StoreService.GetFavorites()) ?? [];
  } catch {
    favorites.value = [];
  }
  try {
    // History rows are per-run, so collapse to distinct tools, newest first.
    const rows = (await StoreService.GetHistory(60)) ?? [];
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const r of rows) {
      if (!r.tool || seen.has(r.tool) || !toolById(r.tool)) continue;
      seen.add(r.tool);
      ids.push(r.tool);
      if (ids.length >= 8) break;
    }
    recentIds.value = ids;
  } catch {
    recentIds.value = [];
  }
});

const recentTools = computed(() => uniqueTools(recentIds.value));

onFilesDropped((files) => {
  dropped.value = files;
});

/** Tools that can handle every dropped file (by extension). */
const candidates = computed(() => {
  if (!dropped.value.length) return [];
  const exts = [...new Set(dropped.value.map((f) => extOf(f.name || f.path)))];
  return TOOLS.filter((tool) => exts.every((e) => tool.accept.includes(e)));
});

const favTools = computed(() => uniqueTools(favorites.value));

function openWith(toolId: string) {
  router.push({ path: `/t/${toolId}`, state: handoffState(dropped.value) as never });
  dropped.value = [];
}

async function toggleFav(id: string, e: Event) {
  e.stopPropagation();
  if (inWails()) {
    try {
      await StoreService.ToggleFavorite(id);
      favorites.value = (await StoreService.GetFavorites()) ?? [];
      return;
    } catch {
      /* fall through */
    }
  }
  favorites.value = favorites.value.includes(id)
    ? favorites.value.filter((f) => f !== id)
    : [...favorites.value, id];
}

/** Dismiss one recent tool by wiping its history rows. */
async function removeRecent(id: string) {
  if (inWails()) {
    try {
      await StoreService.RemoveHistoryByTool(id);
    } catch {
      /* the local trim below still applies */
    }
  }
  recentIds.value = recentIds.value.filter((x) => x !== id);
}

const groups = computed(() => {
  void lang.value;
  return CATEGORIES.map((c) => ({
    id: c.id,
    icon: c.icon,
    label: t(`nav.${c.id}`),
    tools: toolsInCategory(c.id),
  }));
});

/** Big search field is a facade for the command palette (⌘K). */
function openPalette() {
  window.dispatchEvent(new Event("hitool:open-palette"));
}

/**
 * Each tile's icon sits on a soft plate tinted by its category. The palette
 * lives in tokens.css (--cat-*); we only hand the pair down as local vars.
 */
function plateStyle(cat: string): CSSProperties {
  return {
    "--plate": `var(--cat-${cat}-wash, var(--acc-wash))`,
    "--plate-ink": `var(--cat-${cat}, var(--acc))`,
  } as CSSProperties;
}
</script>

<template>
  <div class="land scroll-y" data-file-drop-target="landing">
    <!-- Drop result: what can act on these files -->
    <section v-if="dropped.length" class="catch">
      <div class="catch-head">
        <span class="lab">{{ t("land.dropped", { n: dropped.length }) }}</span>
        <button class="btn btn-sm btn-quiet" @click="dropped = []">
          <Icon name="X" /> {{ t("common.clear") }}
        </button>
      </div>

      <div class="catch-files">
        <span v-for="f in dropped.slice(0, 6)" :key="f.path" class="catch-file">
          <span class="ext">{{ extOf(f.name || f.path) }}</span>
          <span class="truncate">{{ f.name }}</span>
          <span class="lab">{{ formatBytes(f.size) }}</span>
        </span>
        <span v-if="dropped.length > 6" class="lab">+{{ dropped.length - 6 }}</span>
      </div>

      <p class="lab">{{ candidates.length ? t("land.openWith") : t("land.noHandler") }}</p>
      <div class="catch-tools">
        <button v-for="tool in candidates" :key="tool.id" class="btn" @click="openWith(tool.id)">
          <Icon :name="tool.icon" />
          {{ t(`tools.${tool.id}.name`) }}
        </button>
      </div>
    </section>

    <!-- Idle hero doubles as the drop hint -->
    <section v-else class="hero" :class="{ hot: dragActive }">
      <img class="hero-mark" src="/hitool.png" alt="" width="52" height="52" />
      <h1>{{ t("land.title") }}</h1>
      <p class="hero-sub">{{ t("land.sub") }}</p>
      <button class="hero-search" @click="openPalette">
        <Icon name="Search" />
        <span class="truncate">{{ t("land.searchHint") }}</span>
        <KbdCombo combo="mod+k" />
      </button>
      <p class="lab hero-hint">{{ t("land.dropHint") }}</p>
    </section>

    <section v-if="recentTools.length" class="group">
      <div class="group-head">
        <Icon name="History" class="ghead-icon" />
        <span class="lab">{{ t("land.recent") }}</span>
        <span class="rule-line" />
      </div>
      <div class="recents">
        <button
          v-for="tool in recentTools"
          :key="tool.id"
          class="recent"
          @click="router.push(`/t/${tool.id}`)"
        >
          <Icon :name="tool.icon" />
          {{ t(`tools.${tool.id}.name`) }}
          <span
            class="recent-rm"
            role="button"
            tabindex="0"
            :title="t('land.removeRecent')"
            @click.stop="removeRecent(tool.id)"
            @keydown.enter.prevent.stop="removeRecent(tool.id)"
            @keydown.space.prevent.stop="removeRecent(tool.id)"
          >
            <Icon name="X" />
          </span>
        </button>
      </div>
    </section>

    <section v-if="favTools.length" class="group">
      <div class="group-head">
        <Icon name="Star" class="star" />
        <span class="lab">{{ t("common.favorites") }}</span>
      </div>
      <div class="grid">
        <button
          v-for="tool in favTools"
          :key="tool.id"
          class="tile"
          @click="router.push(`/t/${tool.id}`)"
        >
          <span class="tile-plate" :style="plateStyle(tool.category)">
            <Icon :name="tool.icon" />
          </span>
          <span class="tile-name">{{ t(`tools.${tool.id}.name`) }}</span>
          <span
            class="tile-fav on"
            role="button"
            tabindex="0"
            :title="t('common.favorites')"
            @click="toggleFav(tool.id, $event)"
            @keydown.enter.prevent.stop="toggleFav(tool.id, $event)"
            @keydown.space.prevent.stop="toggleFav(tool.id, $event)"
          >
            <Icon name="Star" />
          </span>
        </button>
      </div>
    </section>

    <section v-for="g in groups" :key="g.id" class="group">
      <div class="group-head" :class="g.id">
        <span class="ghead-plate"><Icon :name="g.icon" /></span>
        <span class="lab">{{ g.label }}</span>
        <span class="rule-line" />
      </div>
      <div class="grid">
        <button
          v-for="tool in g.tools"
          :key="tool.id"
          class="tile"
          @click="router.push(`/t/${tool.id}`)"
        >
          <span class="tile-plate" :style="plateStyle(g.id)">
            <Icon :name="tool.icon" />
          </span>
          <span class="tile-name">{{ t(`tools.${tool.id}.name`) }}</span>
          <span class="tile-desc truncate">{{ t(`tools.${tool.id}.desc`) }}</span>
          <span
            class="tile-fav"
            role="button"
            tabindex="0"
            :class="{ on: favorites.includes(tool.id) }"
            :title="t('common.favorites')"
            @click="toggleFav(tool.id, $event)"
            @keydown.enter.prevent.stop="toggleFav(tool.id, $event)"
            @keydown.space.prevent.stop="toggleFav(tool.id, $event)"
          >
            <Icon name="Star" />
          </span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* v0.6 Candy launcher: the tinted ground shows through; white cards
   and category hues carry the colour. */
.land {
  flex: 1;
  min-height: 0;
  padding: 20px 24px 40px;
  background: radial-gradient(
      120% 90% at 78% -10%,
      var(--cat-text-wash) 0%,
      transparent 55%
    ),
    radial-gradient(
      100% 80% at 8% 108%,
      var(--cat-creative-wash) 0%,
      transparent 52%
    ),
    var(--bg);
}

@media (max-width: 900px) {
  .land {
    padding: 16px 14px 28px;
  }
  .grid {
    gap: 9px;
  }
}

/* ---- hero / drop hint — Spotlight-ish: centred, one big search field ---- */
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 28px 0 30px;
  border-radius: var(--r-lg);
  transition: background 0.2s var(--ease);
}

.hero-mark {
  width: 52px;
  height: 52px;
  margin-bottom: 12px;
  border-radius: var(--r);
  display: block;
}

.hero.hot {
  background: var(--acc-wash);
  outline: 2px dashed var(--acc-line);
  outline-offset: 8px;
}

.hero h1 {
  font-size: var(--t-3xl);
  font-weight: 800;
  letter-spacing: -0.028em;
  background: var(--brand-grad);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero-sub {
  font-size: var(--t-lg);
  color: var(--ink-3);
  margin-top: 6px;
}

.hero-search {
  display: flex;
  align-items: center;
  gap: 10px;
  width: min(480px, 100%);
  height: 46px;
  margin-top: 24px;
  padding: 0 9px 0 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--s-1);
  color: var(--ink-4);
  font-family: var(--f-ui);
  font-size: var(--t-md);
  cursor: pointer;
  box-shadow: var(--e-2);
  transition: box-shadow 0.2s var(--ease-out), transform 0.2s var(--ease-out),
    border-color 0.16s var(--ease), color 0.16s var(--ease);
}

.hero-search:hover {
  border-color: var(--acc-line);
  color: var(--acc);
  transform: translateY(-1px) scale(1.005);
  box-shadow: var(--e-3);
}

.hero-search :deep(svg) {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.hero-search span {
  flex: 1;
  min-width: 0;
  text-align: left;
}

.hero-search kbd {
  flex-shrink: 0;
}

.hero-hint {
  margin-top: 15px;
  font-size: var(--t-sm);
  color: var(--ink-4);
  font-weight: 400;
}

/* ---- dropped-files catcher ---- */
.catch {
  border: 1px solid var(--acc-line);
  border-radius: var(--r-lg);
  background: var(--acc-wash);
  padding: 18px 20px;
  margin-bottom: 26px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.catch-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.catch-head .btn {
  margin-left: auto;
}

.catch-files {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
}

.catch-file {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 260px;
  padding: 5px 11px;
  border-radius: var(--r-pill);
  background: var(--s-1);
  border: 1px solid var(--line);
  font-size: var(--t-sm);
}

.ext {
  font-family: var(--f-mono);
  font-size: var(--t-xs);
  font-weight: 700;
  color: var(--acc);
  text-transform: uppercase;
}

.catch-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* ---- groups ---- */
.group {
  margin-top: 26px;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 14px;
}

/* Category hue for the group head plate + rule. */
.group-head.pdf { --c: var(--cat-pdf); }
.group-head.image { --c: var(--cat-image); }
.group-head.text { --c: var(--cat-text); }
.group-head.dev { --c: var(--cat-dev); }
.group-head.calculator { --c: var(--cat-calculator); }
.group-head.creative { --c: var(--cat-creative); }
.group-head.ai { --c: var(--cat-ai); }

.ghead-plate {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--c, var(--acc)) 15%, transparent);
  color: var(--c, var(--ink-3));
}

.ghead-plate :deep(svg) {
  width: 14px;
  height: 14px;
}

.ghead-icon,
.star {
  width: 15px;
  height: 15px;
  color: var(--ink-3);
}

.star {
  color: var(--warn-bright);
}

.group-head .lab {
  font-size: var(--t-md);
  font-weight: 700;
  color: var(--ink);
}

.rule-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--c, var(--line)) 45%, transparent), var(--line-2));
}

/* ---- recents: compact pills, since they're shortcuts not descriptions ---- */
.recents {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.recent {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 15px;
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--s-1);
  color: var(--ink-2);
  font-family: var(--f-ui);
  font-size: var(--t-sm);
  font-weight: 550;
  cursor: pointer;
  box-shadow: var(--e-1);
  transition: all 0.14s var(--ease);
}

.recent:hover {
  border-color: var(--acc-line);
  color: var(--acc);
  transform: translateY(-1px);
  box-shadow: var(--e-2);
}

.recent :deep(svg) {
  width: 15px;
  height: 15px;
}

/* Dismissal lives inside the pill but stays quiet until hovered. */
.recent-rm {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  margin-right: -6px;
  border-radius: 50%;
  color: var(--ink-4);
  opacity: 0;
  transition: opacity 0.12s var(--ease), color 0.12s;
}

.recent:hover .recent-rm {
  opacity: 1;
}

.recent-rm:hover {
  color: var(--fail);
}

.recent-rm :deep(svg) {
  width: 10px;
  height: 10px;
}

/* ---- tool grid ---- */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(228px, 1fr));
  gap: 12px;
}

.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 15px 16px 16px;
  border: 1px solid transparent;
  border-radius: var(--r-lg);
  background: var(--s-1);
  cursor: pointer;
  text-align: left;
  font-family: var(--f-ui);
  box-shadow: var(--e-1);
  transition: transform 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out),
    border-color 0.16s var(--ease);
}

.tile:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--plate-ink, var(--acc)) 30%, transparent);
  box-shadow: var(--e-2);
}

/* Category-tinted icon plate; colours arrive via inline --plate vars.
   The plate leans back a degree as the card lifts forward. */
.tile-plate {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: var(--r);
  margin-bottom: 8px;
  background: var(--plate);
  color: var(--plate-ink);
  transition: transform 0.2s var(--ease-out);
}

.tile:hover .tile-plate {
  transform: scale(1.05) rotate(-2deg);
}

.tile-plate :deep(svg) {
  width: 19px;
  height: 19px;
}

.tile-name {
  font-size: var(--t-md);
  font-weight: 650;
  color: var(--ink);
}

.tile-desc {
  font-size: var(--t-sm);
  color: var(--ink-3);
  max-width: 100%;
}

.tile-fav {
  position: absolute;
  top: 11px;
  right: 11px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--r-sm);
  color: var(--ink-4);
  opacity: 0;
  transition: opacity 0.14s, color 0.14s, background 0.14s;
}

.tile:hover .tile-fav,
.tile-fav:focus-visible {
  opacity: 1;
}

.tile-fav:hover,
.tile-fav:focus-visible {
  background: var(--s-3);
  color: var(--warn);
}

.tile-fav.on {
  opacity: 1;
  color: var(--warn);
}

.tile-fav :deep(svg) {
  width: 15px;
  height: 15px;
}
</style>
