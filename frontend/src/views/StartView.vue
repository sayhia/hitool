<script setup lang="ts">
/**
 * The start page. Navigation itself lives in the tool tree, so this is
 * only a doorway: one search field (it opens the palette), recent tools,
 * and the drag hint. Everything else is one click away in the tree.
 */
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import { t, lang } from "../lib/i18n";
import { toolById, uniqueTools } from "../lib/tools";
import * as StoreService from "@bindings/hitool/services/storeservice";
import { inWails } from "../lib/backend";

const router = useRouter();
const recents = ref<string[]>([]);

onMounted(async () => {
  if (!inWails()) return;
  try {
    const rows = (await StoreService.GetHistory(40)) ?? [];
    const ids: string[] = [];
    for (const r of rows) {
      if (r.tool && !ids.includes(r.tool)) ids.push(r.tool);
      if (ids.length >= 8) break;
    }
    recents.value = ids;
  } catch {
    recents.value = [];
  }
});

function openPalette() {
  window.dispatchEvent(new Event("hitool:open-palette"));
}

const recentTools = computed(() => {
  void lang.value;
  return uniqueTools(recents.value).map((x) => ({
    id: x.id,
    icon: x.icon,
    label: t(`tools.${x.id}.name`),
  }));
});
</script>

<template>
  <div class="start">
    <div class="hero">
      <h1>{{ t("land.title") }}</h1>
      <p class="sub">{{ t("land.sub") }}</p>
      <button class="search" @click="openPalette">
        <Icon name="Search" />
        <span>{{ t("cmd.placeholder") }}</span>
        <kbd>⌘K</kbd>
      </button>
      <p class="hint">{{ t("land.searchHint") }}</p>
    </div>

    <section v-if="recentTools.length" class="recent">
      <div class="r-head">{{ t("land.recent") }}</div>
      <div class="r-row">
        <button
          v-for="tool in recentTools"
          :key="tool.id"
          type="button"
          class="r-chip"
          @click="router.push(`/t/${tool.id}`)"
        >
          <Icon :name="tool.icon" />
          <span class="truncate">{{ tool.label }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.start {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 9vh 32px 40px;
}

.hero {
  max-width: 560px;
  margin: 0 auto;
  text-align: center;
}

h1 {
  font-size: var(--t-3xl);
  font-weight: 800;
  letter-spacing: -0.03em;
}

.sub {
  margin-top: 6px;
  color: var(--ink-3);
  font-size: var(--t-md);
}

.search {
  margin-top: 26px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--s-1);
  color: var(--ink-3);
  font-family: var(--f-ui);
  font-size: var(--t-md);
  cursor: pointer;
  transition: border-color 0.16s var(--ease), box-shadow 0.16s var(--ease);
}

.search:hover {
  border-color: var(--acc-line);
  box-shadow: var(--focus-ring);
}

.search svg {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.search span {
  flex: 1;
  text-align: left;
}

.search kbd {
  font-size: 10px;
}

.hero .hint {
  margin-top: 12px;
}

.recent {
  max-width: 640px;
  margin: 48px auto 0;
}

.r-head {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.02em;
  color: var(--ink-4);
  padding: 0 2px 8px;
}

.r-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.r-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px;
  max-width: 200px;
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--s-1);
  color: var(--ink-2);
  font-family: var(--f-ui);
  font-size: var(--t-sm);
  font-weight: 550;
  cursor: pointer;
}

.r-chip:hover {
  border-color: var(--acc-line);
  color: var(--acc);
}

.r-chip svg {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}
</style>
