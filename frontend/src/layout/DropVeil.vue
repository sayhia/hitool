<script setup lang="ts">
/** Full-window affordance while a drag hovers — tells you the app takes files. */
import { dragActive } from "../lib/drop";
import { t } from "../lib/i18n";
import Icon from "../components/Icon.vue";
</script>

<template>
  <transition name="fade">
    <div v-if="dragActive" class="veil">
      <div class="frame">
        <div class="badge">
          <Icon name="Download" />
          <span>{{ t("drop.release") }}</span>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
/* Frosted dim over the whole window; the inset dashed ring says
   "let go anywhere". */
.veil {
  position: fixed;
  inset: 0;
  z-index: 50;
  pointer-events: none;
  background: color-mix(in srgb, var(--ink) 12%, transparent);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  padding: 14px;
}

.frame {
  height: 100%;
  border: 2.5px dashed var(--acc);
  border-radius: var(--r-xl);
  background: color-mix(in srgb, var(--acc) 8%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.badge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 24px;
  background: var(--brand-grad);
  color: var(--acc-ink);
  border-radius: var(--r-pill);
  font-family: var(--f-ui);
  font-size: var(--t-lg);
  font-weight: 650;
  letter-spacing: 0.02em;
  box-shadow: 0 6px 18px rgba(51, 118, 251, 0.4);
}

.badge :deep(svg) {
  width: 17px;
  height: 17px;
}
</style>
