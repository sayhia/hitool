<script setup lang="ts">
/**
 * Compact update indicator that lives in the CommandBar next to the theme
 * toggle. Stays out of the way until something is happening:
 *   - checking   spinning refresh icon
 *   - available  download icon + dot (click → Settings → About)
 *   - downloading download icon wrapped in an SVG progress ring
 *   - ready      restart icon, acc-coloured + pulse (click → restart)
 */
import { computed } from "vue";
import { t } from "../lib/i18n";
import {
  updateState,
  releaseInfo,
  updateProgress,
  restartApp,
} from "../stores/update";
import { openSettings } from "../stores/settings";
import Icon from "./Icon.vue";

const visible = computed(() =>
  ["checking", "available", "downloading", "ready"].includes(updateState.value),
);

const pct = computed(() => Math.round(updateProgress.value * 100));

const C = 2 * Math.PI * 9; // ring circumference (r=9)

const title = computed(() => {
  const v = releaseInfo.value?.latest ?? "";
  switch (updateState.value) {
    case "downloading":
      return `${t("update.downloading", { v })} ${pct.value}%`;
    case "ready":
      return `${t("update.readyBrief", { v })} — ${t("update.restartNow")}`;
    case "available":
      return t("update.available", { v });
    default:
      return t("update.checking");
  }
});

function onClick() {
  if (updateState.value === "ready") void restartApp();
  else openSettings("about");
}
</script>

<template>
  <button
    v-if="visible"
    class="upd-btn"
    :class="updateState"
    :title="title"
    @click="onClick"
  >
    <svg v-if="updateState === 'downloading'" class="ring" viewBox="0 0 24 24">
      <circle class="ring-bg" cx="12" cy="12" r="9" />
      <circle
        class="ring-fg"
        cx="12"
        cy="12"
        r="9"
        :stroke-dasharray="C"
        :stroke-dashoffset="C * (1 - pct / 100)"
      />
    </svg>
    <Icon v-else-if="updateState === 'ready'" name="RotateCw" />
    <Icon v-else-if="updateState === 'available'" name="Download" />
    <Icon v-else name="RefreshCw" class="spinning" />
    <span v-if="updateState === 'available'" class="dot" />
  </button>
</template>

<style scoped>
.upd-btn {
  position: relative;
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
}
.upd-btn:hover {
  background: var(--acc-wash);
  color: var(--acc);
}
.upd-btn :deep(svg:not(.ring)) {
  width: 16px;
  height: 16px;
}

/* ready: lift it so the eye lands on it */
.upd-btn.ready {
  color: var(--acc);
  background: var(--acc-wash);
}
.upd-btn.ready::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--r-sm);
  box-shadow: 0 0 0 0 var(--acc);
  animation: pulse 1.8s var(--ease) infinite;
  pointer-events: none;
}
@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--acc) 55%, transparent);
  }
  70% {
    box-shadow: 0 0 0 6px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

/* checking: slow spin */
.spinning {
  animation: spin 1.1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* downloading: standalone SVG progress ring (no inner icon — cleaner at this
   size than nesting an icon inside the ring). */
.ring {
  width: 20px;
  height: 20px;
  transform: rotate(-90deg);
}
.ring-bg {
  fill: none;
  stroke: color-mix(in srgb, var(--ink) 14%, transparent);
  stroke-width: 2.5;
}
.ring-fg {
  fill: none;
  stroke: var(--acc);
  stroke-width: 2.5;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.3s var(--ease);
}

/* available: tiny dot like a notification badge */
.dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--acc);
  border: 1.5px solid var(--chrome);
}
</style>
