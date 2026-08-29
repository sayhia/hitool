<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { t, lang } from "../lib/i18n";
import { toolById } from "../lib/tools";
import { theme, cycleTheme } from "../lib/theme";
import { sidebarOpen, toggleSidebar } from "../stores/sidebar";
import { openSettings } from "../stores/settings";
import Icon from "../components/Icon.vue";
import UpdateButton from "../components/UpdateButton.vue";
import KbdCombo from "../components/KbdCombo.vue";

defineEmits<{ (e: "open-palette"): void }>();

const route = useRoute();

/** Page title reads 分类 › 工具, or just the page name. */
const crumb = computed(() => {
  void lang.value;
  const p = route.path;
  if (p.startsWith("/t/")) {
    const tool = toolById(p.slice(3));
    if (tool) return [t(`nav.${tool.category}`), t(`tools.${tool.id}.name`)];
  }
  if (p.startsWith("/c/")) return [t(`nav.${p.slice(3)}`)];
  return [t("nav.home")];
});

const themeIcon = computed(() =>
  theme.value === "dark" ? "Moon" : theme.value === "light" ? "Sun" : "SunMoon",
);
</script>

<template>
  <header class="bar">
    <!-- The sidebar now clears the traffic lights; this bar is the
         content-column drag zone. -->
    <button
      class="tb-btn side-toggle"
      :title="sidebarOpen ? t('nav.collapse') : t('nav.expand')"
      @click="toggleSidebar"
    >
      <Icon :name="sidebarOpen ? 'PanelLeftClose' : 'PanelLeft'" />
    </button>

    <nav class="crumb">
      <template v-for="(c, i) in crumb" :key="c">
        <Icon v-if="i > 0" name="ChevronRight" class="sep" />
        <span class="crumb-part" :class="{ last: i === crumb.length - 1 }">{{ c }}</span>
      </template>
    </nav>

    <div class="tools">
      <button class="search" @click="$emit('open-palette')">
        <Icon name="Search" />
        <span class="search-text">{{ t("cmd.placeholder") }}</span>
        <KbdCombo combo="mod+k" />
      </button>
      <UpdateButton />
      <button class="tb-btn" :title="t('settings.theme')" @click="cycleTheme">
        <Icon :name="themeIcon" />
      </button>
      <button class="tb-btn" :title="t('nav.settings')" @click="openSettings()">
        <Icon name="Settings2" />
      </button>
    </div>
  </header>
</template>

<style scoped>
/* Content-column toolbar. Traffic lights live on the full-height sidebar. */
.bar {
  height: var(--bar-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px 0 10px;
  background: var(--chrome);
  backdrop-filter: blur(var(--chrome-blur)) saturate(1.6);
  -webkit-backdrop-filter: blur(var(--chrome-blur)) saturate(1.6);
  border-bottom: 1px solid var(--line-2);
  --wails-draggable: drag;
}

.tb-btn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
  transition: background 0.16s var(--ease), color 0.16s var(--ease);
  --wails-draggable: no-drag;
}

.tb-btn:hover {
  background: var(--acc-wash);
  color: var(--acc);
}

.tb-btn:active {
  background: var(--acc-wash-2);
}

.tb-btn :deep(svg) {
  width: 16px;
  height: 16px;
}

.crumb {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: var(--t-lg);
  color: var(--ink-3);
  overflow: hidden;
}

.crumb-part {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.crumb-part.last {
  color: var(--ink);
  font-weight: 700;
  letter-spacing: -0.015em;
}

.sep {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--ink-4);
}

.tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 5px;
  --wails-draggable: no-drag;
}

/* Recessed capsule search field: reads as an input, opens the palette. */
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  width: clamp(180px, 26vw, 280px);
  padding: 0 8px 0 12px;
  border: 1px solid transparent;
  border-radius: var(--r-pill);
  background: var(--hover);
  cursor: pointer;
  color: var(--ink-3);
  font-family: var(--f-ui);
  transition: background 0.16s var(--ease), border-color 0.16s var(--ease),
    color 0.16s var(--ease), box-shadow 0.16s var(--ease);
}

.search:hover {
  background: var(--acc-wash);
  border-color: var(--acc-line);
  color: var(--acc);
}

.search :deep(svg) {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

.search-text {
  flex: 1;
  text-align: left;
  font-size: var(--t-sm);
}

.search kbd {
  font-size: 9.5px;
  padding: 0 4px;
}

/* Narrow windows: keep the essentials, shed the text. */
@media (max-width: 900px) {
  .crumb {
    display: none;
  }
  .search {
    width: auto;
    min-width: 0;
    padding: 0 8px;
    gap: 6px;
  }
  .search-text {
    display: none;
  }
}
</style>
