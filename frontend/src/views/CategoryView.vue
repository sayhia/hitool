<script setup lang="ts">
import { computed, onMounted, ref, type CSSProperties } from "vue";
import { useRoute, useRouter } from "vue-router";
import { toolsInCategory, toolGroupsInCategory, type CategoryId } from "../lib/tools";
import { t, lang } from "../lib/i18n";
import { inWails } from "../lib/backend";
import * as StoreService from "@bindings/hitool/services/storeservice";
import Icon from "../components/Icon.vue";

const route = useRoute();
const router = useRouter();
const favorites = ref<string[]>([]);

const catId = computed(() => route.params.id as CategoryId);
const tools = computed(() => toolsInCategory(catId.value));

/**
 * A category with declared sub-groups renders one labelled section per
 * group; everything else is a single anonymous section, so the tile
 * markup below stays single-source.
 */
const sections = computed(() => {
  const grouped = toolGroupsInCategory(catId.value);
  return grouped.length ? grouped : [{ key: "", tools: tools.value }];
});
const title = computed(() => {
  void lang.value;
  return t(`nav.${catId.value}`);
});

onMounted(async () => {
  if (!inWails()) return;
  try {
    favorites.value = (await StoreService.GetFavorites()) ?? [];
  } catch {
    favorites.value = [];
  }
});

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

/** Same category-tinted icon plate as the landing tiles (see tokens --cat-*). */
function plateStyle(cat: string): CSSProperties {
  return {
    "--plate": `var(--cat-${cat}-wash, var(--acc-wash))`,
    "--plate-ink": `var(--cat-${cat}, var(--acc))`,
  } as CSSProperties;
}
</script>

<template>
  <div class="cat scroll-y">
    <header class="cat-head" :style="plateStyle(catId)">
      <h1>{{ title }}</h1>
      <span class="lab">{{ tools.length }} {{ t("common.tools") }}</span>
    </header>

    <section v-for="sec in sections" :key="sec.key || catId" class="tgroup">
      <h2 v-if="sec.key" class="group-h">
        {{ t(sec.key) }}
        <span class="group-n">{{ sec.tools.length }}</span>
      </h2>

      <div class="grid">
        <button
          v-for="tool in sec.tools"
          :key="tool.id"
          class="tile"
          @click="router.push(`/t/${tool.id}`)"
        >
          <span class="tile-plate" :style="plateStyle(catId)">
            <Icon :name="tool.icon" />
          </span>
          <span class="tile-body">
            <span class="tile-name">{{ t(`tools.${tool.id}.name`) }}</span>
            <span class="tile-desc">{{ t(`tools.${tool.id}.desc`) }}</span>
            <span v-if="tool.accept.length" class="lab tile-accept">
              {{ tool.accept.slice(0, 6).join(" · ") }}
            </span>
          </span>
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
.cat {
  flex: 1;
  background: var(--bg);
  padding: 0 24px 36px;
}

.cat-head {
  display: flex;
  align-items: baseline;
  gap: 11px;
  padding: 24px 2px 14px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--line-2);
}

/* The page title wears the category hue as a soft underline accent. */
.cat-head h1 {
  font-size: var(--t-2xl);
  font-weight: 800;
  letter-spacing: -0.024em;
  position: relative;
}

.cat-head h1::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -9px;
  width: 42px;
  height: 3.5px;
  border-radius: var(--r-pill);
  background: linear-gradient(90deg, var(--plate-ink, var(--acc)), transparent 130%);
}

/* Grouped sections: a quiet heading per group, like the rail's section
   labels — colour stays on the tiles, the headers stay out of the way. */
.tgroup + .tgroup {
  margin-top: 24px;
}

.group-h {
  display: flex;
  align-items: baseline;
  gap: 7px;
  margin: 0 2px 10px;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.02em;
  color: var(--ink-3);
}

.group-n {
  font-size: 10.5px;
  font-weight: 550;
  color: var(--ink-4);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}

.tile {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 13px;
  padding: 14px 15px;
  border: 1px solid transparent;
  border-radius: var(--r-lg);
  background: var(--s-1);
  color: var(--ink);
  font-family: var(--f-ui);
  text-align: left;
  cursor: pointer;
  box-shadow: var(--e-1);
  transition: transform 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out),
    border-color 0.16s var(--ease);
  min-width: 0;
}

.tile:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--plate-ink, var(--acc)) 30%, transparent);
  box-shadow: var(--e-2);
}

/* Category-tinted icon plate; colours arrive via inline --plate vars. */
.tile-plate {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  margin-top: 2px;
  border-radius: var(--r);
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

.tile-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-right: 20px;
}

.tile-name {
  font-size: 13.5px;
  font-weight: 650;
}

.tile-desc {
  font-size: 11.5px;
  color: var(--ink-3);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tile-accept {
  font-size: 9px;
  margin-top: 4px;
}

.tile-fav {
  position: absolute;
  top: 9px;
  right: 9px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: var(--r-sm);
  color: var(--ink-4);
  opacity: 0;
  transition: opacity 0.14s, color 0.14s, background 0.14s;
}

.tile:hover .tile-fav,
.tile-fav.on {
  opacity: 1;
}

.tile-fav:hover,
.tile-fav:focus-visible {
  background: var(--s-3);
  opacity: 1;
}

.tile-fav.on {
  color: var(--warn);
}

.tile-fav :deep(svg) {
  width: 12px;
  height: 12px;
}
</style>
