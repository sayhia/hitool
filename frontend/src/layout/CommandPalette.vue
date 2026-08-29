<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { TOOLS, TOOL_ALIASES, toolById, CATEGORIES } from "../lib/tools";
import { t, lang } from "../lib/i18n";
import { useJobs } from "../stores/jobs";
import { setTheme, theme } from "../lib/theme";
import { setLang, lang as uiLang } from "../lib/i18n";
import { toggleInspector } from "../stores/inspector";
import { openSettings } from "../stores/settings";
import { closeAll } from "../stores/tabs";
import { baseName } from "../lib/backend";
import { fuzzyMatch, splitHighlight } from "../lib/fuzzyMatch";
import Icon from "../components/Icon.vue";
import { comboText } from "../lib/shortcuts";

const open = defineModel<boolean>("open", { default: false });

const router = useRouter();
const query = ref("");
const cursor = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);
const { recentJobs } = useJobs();

interface Row {
  kind: "tool" | "job" | "action";
  id: string;
  icon: string;
  title: string;
  meta: string;
  go: () => void;
  /** Fuzzy rank (higher first) and matched ranges over the title. */
  score: number;
  ranges: [number, number][];
}

const rows = computed<Row[]>(() => {
  void lang.value;
  let q = query.value.trim().toLowerCase();

  // A leading #<category> scopes the search to one shelf, e.g. "#dev jwt".
  let catFilter = "";
  if (q.startsWith("#")) {
    const sp = q.indexOf(" ");
    const head = sp < 0 ? q.slice(1) : q.slice(1, sp);
    const cat = CATEGORIES.find(
      (c) => c.id.includes(head) || t(`nav.${c.id}`).toLowerCase().includes(head),
    );
    if (cat) {
      catFilter = cat.id;
      q = sp < 0 ? "" : q.slice(sp + 1).trim();
    }
  }

  // Commands, not just destinations: the palette should be able to *do*
  // things, otherwise it is only a fancy menu.
  const actions: Row[] = [
    {
      kind: "action" as const,
      id: "theme-light",
      icon: "Sun",
      title: t("cmd.themeLight"),
      meta: t("settings.theme"),
      go: () => setTheme("light"),
    },
    {
      kind: "action" as const,
      id: "theme-dark",
      icon: "Moon",
      title: t("cmd.themeDark"),
      meta: t("settings.theme"),
      go: () => setTheme("dark"),
    },
    {
      kind: "action" as const,
      id: "theme-auto",
      icon: "SunMoon",
      title: t("cmd.themeAuto"),
      meta: t("settings.theme"),
      go: () => setTheme("auto"),
    },
    {
      kind: "action" as const,
      id: "lang-toggle",
      icon: "Languages",
      title: uiLang.value === "zh" ? "Switch to English" : "切换到中文",
      meta: t("settings.language"),
      go: () => setLang(uiLang.value === "zh" ? "en" : "zh"),
    },
    {
      kind: "action" as const,
      id: "inspector",
      icon: "PanelRight",
      title: t("cmd.toggleInspector"),
      meta: comboText("mod+i"),
      go: () => toggleInspector(),
    },
    {
      kind: "action" as const,
      id: "close-tabs",
      icon: "X",
      title: t("tabs.closeAll"),
      meta: t("cmd.tabs"),
      go: () => closeAll(router),
    },
    {
      kind: "action" as const,
      id: "settings",
      icon: "Settings2",
      title: t("nav.settings"),
      meta: comboText("mod+,"),
      go: () => openSettings(),
    },
  ]
    .map((r): Row | null => {
      if (!q) return { ...r, score: 0, ranges: [] as [number, number][] };
      const hit = fuzzyMatch(q, r.title);
      if (hit) return { ...r, score: hit.score, ranges: hit.ranges };
      if (r.meta.toLowerCase().includes(q)) return { ...r, score: 100, ranges: [] as [number, number][] };
      return null;
    })
    .filter((r): r is Row => !!r);

  const tools: Row[] = TOOLS.filter((tool) => !catFilter || tool.category === catFilter)
    .map((tool): Row => ({
      kind: "tool",
      id: tool.id,
      icon: tool.icon,
      title: t(`tools.${tool.id}.name`),
      meta: t(`nav.${tool.category}`),
      go: () => router.push(`/t/${tool.id}`),
      score: 0,
      ranges: [],
    }))
    .map((r): Row | null => {
      if (!q) return { ...r, score: 0, ranges: [] as [number, number][] };
      const hit = fuzzyMatch(q, r.title);
      if (hit) return { ...r, score: hit.score, ranges: hit.ranges };
      // Id and description stay searchable without a highlight to claim.
      const tool = toolById(r.id)!;
      if (r.id.includes(q) || t(`tools.${tool.id}.desc`).toLowerCase().includes(q)) {
        return { ...r, score: 100, ranges: [] as [number, number][] };
      }
      const aliasHit = Object.entries(TOOL_ALIASES).some(([from, to]) => {
        if (to.id !== tool.id) return false;
        return (
          from.includes(q) ||
          t(`tools.${from}.name`).toLowerCase().includes(q) ||
          t(`tools.${from}.desc`).toLowerCase().includes(q)
        );
      });
      if (aliasHit) return { ...r, score: 90, ranges: [] as [number, number][] };
      return null;
    })
    .filter((r): r is Row => !!r);

  // Finished jobs are searchable too — that is where "the file I made
  // yesterday" actually lives.
  const jobs: Row[] = recentJobs.value
    .filter((j) => j.outputs.length > 0)
    .flatMap((j): Row[] =>
      j.outputs.map((o): Row => ({
        kind: "job",
        id: `${j.id}:${o.path}`,
        icon: "FileCheck2",
        title: baseName(o.path),
        meta: `${t(`tools.${j.tool}.name`)} · ${o.detail}`,
        go: () => router.push(`/t/${j.tool}`),
        score: 0,
        ranges: [],
      })),
    )
    .map((r): Row | null => {
      if (!q) return { ...r, score: 0, ranges: [] as [number, number][] };
      const hit = fuzzyMatch(q, r.title);
      return hit ? { ...r, score: hit.score, ranges: hit.ranges } : null;
    })
    .filter((r): r is Row => !!r)
    .slice(0, 6);

  if (catFilter) return q ? tools.sort((a, b) => b.score - a.score) : tools;

  return q
    ? [...actions, ...tools, ...jobs].sort((a, b) => b.score - a.score)
    : [...tools.slice(0, 8), ...actions, ...jobs];
});

watch(open, async (v) => {
  if (v) {
    query.value = "";
    cursor.value = 0;
    await nextTick();
    inputEl.value?.focus();
  }
});

watch(rows, () => {
  if (cursor.value >= rows.value.length) cursor.value = Math.max(0, rows.value.length - 1);
});

function move(delta: number) {
  const n = rows.value.length;
  if (!n) return;
  cursor.value = (cursor.value + delta + n) % n;
  nextTick(() => {
    document.querySelector(".pal-row.on")?.scrollIntoView({ block: "nearest" });
  });
}

function choose(row?: Row) {
  const target = row ?? rows.value[cursor.value];
  if (!target) return;
  open.value = false;
  target.go();
}
</script>

<template>
  <transition name="fade">
    <div v-if="open" class="pal-veil" @click.self="open = false">
      <div class="pal" role="dialog" aria-modal="true">
        <div class="pal-input">
          <Icon name="Search" />
          <input
            ref="inputEl"
            v-model="query"
            :placeholder="t('cmd.placeholder')"
            spellcheck="false"
            autocomplete="off"
            @keydown.down.prevent="move(1)"
            @keydown.up.prevent="move(-1)"
            @keydown.enter.prevent="choose()"
            @keydown.esc.prevent="open = false"
          />
          <kbd>ESC</kbd>
        </div>

        <div v-if="rows.length" class="pal-list scroll-y">
          <button
            v-for="(row, i) in rows"
            :key="row.id"
            class="pal-row"
            :class="{ on: i === cursor }"
            @click="choose(row)"
            @mousemove="cursor = i"
          >
            <Icon :name="row.icon" />
            <span class="pal-title truncate">
              <template v-for="(p, pi) in splitHighlight(row.title, row.ranges)" :key="pi">
                <span v-if="p.hit" class="pal-hit">{{ p.text }}</span>
                <template v-else>{{ p.text }}</template>
              </template>
            </span>
            <span class="lab pal-meta truncate">{{ row.meta }}</span>
          </button>
        </div>
        <div v-else class="pal-empty hint">{{ t("cmd.empty") }}</div>

        <div class="pal-foot">
          <span class="lab"><kbd>↑↓</kbd> {{ t("cmd.navigate") }}</span>
          <span class="lab"><kbd>↵</kbd> {{ t("cmd.open") }}</span>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.pal-veil {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: color-mix(in srgb, var(--ink) 18%, transparent);
  display: flex;
  justify-content: center;
  /* flex-start so the panel hugs its content instead of stretching to max-height */
  align-items: flex-start;
  padding-top: 14vh;
}

/* Spotlight-style panel: translucent, big input, quiet list. */
.pal {
  width: min(560px, calc(100vw - 48px));
  max-height: 62vh;
  display: flex;
  flex-direction: column;
  background: var(--chrome);
  backdrop-filter: blur(32px) saturate(1.8);
  -webkit-backdrop-filter: blur(32px) saturate(1.8);
  border: 1px solid var(--line-2);
  border-radius: var(--r-xl);
  box-shadow: var(--e-3);
  overflow: hidden;
}

/* A single brand hairline along the top edge — the palette's one
   moment of colour. */
.pal::before {
  content: "";
  height: 2.5px;
  flex-shrink: 0;
  background: var(--brand-grad);
}

.pal-input {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  height: 48px;
  border-bottom: 1px solid var(--line-2);
}

.pal-input :deep(svg) {
  width: 17px;
  height: 17px;
  color: var(--ink-3);
}

.pal-input input {
  flex: 1;
  border: 0;
  background: transparent;
  outline: none;
  color: var(--ink);
  font-family: var(--f-ui);
  font-size: 16px;
  font-weight: 500;
}

.pal-input input::placeholder {
  color: var(--ink-4);
  font-weight: 400;
}

.pal-list {
  /* The panel clips its overflow, so the list has to do the scrolling —
     without this the rows past the panel height are unreachable. */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.pal-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink);
  font-family: var(--f-ui);
  font-size: 13.5px;
  font-weight: 450;
  cursor: pointer;
  text-align: left;
}

.pal-row.on {
  background: var(--acc-wash-2);
  color: var(--acc);
  font-weight: 600;
}

.pal-row :deep(svg) {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  opacity: 0.85;
}

.pal-title {
  flex: 1;
  min-width: 0;
}

.pal-hit {
  color: var(--acc);
  font-weight: 600;
}

.pal-meta {
  max-width: 46%;
}

.pal-row.on .pal-meta {
  color: color-mix(in srgb, var(--acc) 72%, var(--ink-2));
}

.pal-empty {
  padding: 24px;
  text-align: center;
}

.pal-foot {
  display: flex;
  gap: 16px;
  padding: 8px 14px;
  border-top: 1px solid var(--line-2);
}

.pal-foot .lab {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--ink-3);
  font-weight: 450;
}

.pal-foot kbd {
  font-size: 9.5px;
  padding: 0 4px;
}

/* The named transition had no CSS, so the palette used to pop in. The
   panel also rises a touch so the open feels physical. */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s var(--ease);
}

.fade-enter-active .pal,
.fade-leave-active .pal {
  transition: transform 0.18s var(--ease-out), opacity 0.18s var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-from .pal,
.fade-leave-to .pal {
  transform: translateY(-6px) scale(0.985);
}
</style>
