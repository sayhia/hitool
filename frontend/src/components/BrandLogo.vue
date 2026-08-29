<script setup lang="ts">
/**
 * Sidebar brand mark. Expanded: icon + HiTool wordmark.
 * Collapsed / mac rail: icon only. Click goes home.
 */
import { computed } from "vue";
import { useRouter } from "vue-router";
import { t } from "../lib/i18n";

const props = withDefaults(
  defineProps<{
    named?: boolean;
    size?: number;
  }>(),
  { named: false, size: 32 },
);

const router = useRouter();
const sizePx = computed(() => `${props.size}px`);
</script>

<template>
  <button
    class="brand-logo"
    type="button"
    :title="t('nav.home')"
    @click="router.push('/')"
  >
    <img
      class="mark"
      src="/hitool.png"
      alt=""
      :width="size"
      :height="size"
    />
    <span v-if="named" class="meta">
      <span class="name"><span class="hi">Hi</span>Tool</span>
    </span>
  </button>
</template>

<style scoped>
.brand-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 4px;
  margin: 0;
  border-radius: var(--r);
  --wails-draggable: no-drag;
  transition: background 0.14s var(--ease);
}

.brand-logo:hover {
  background: var(--hover);
}

.mark {
  width: v-bind(sizePx);
  height: v-bind(sizePx);
  flex-shrink: 0;
  border-radius: 8px;
  display: block;
}

.meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  overflow: hidden;
}

.name {
  font-size: 15px;
  font-weight: 750;
  letter-spacing: -0.04em;
  line-height: 1.1;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hi {
  color: var(--brand-gold);
}
</style>
