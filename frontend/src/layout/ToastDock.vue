<script setup lang="ts">
import { dismiss, toasts } from "../stores/toast";
import Icon from "../components/Icon.vue";

const ICONS: Record<string, string> = {
  ok: "CircleCheck",
  fail: "CircleAlert",
  info: "Info",
};
</script>

<template>
  <div class="dock" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind" @click="dismiss(t.id)">
        <Icon :name="ICONS[t.kind]" />
        <span>{{ t.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
/* Sits above the task dock so it never covers the run status. */
.dock {
  position: fixed;
  right: 14px;
  bottom: 44px;
  z-index: 90;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 14px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-xl);
  background: var(--chrome);
  backdrop-filter: blur(24px) saturate(1.6);
  -webkit-backdrop-filter: blur(24px) saturate(1.6);
  box-shadow: var(--e-2);
  font-size: var(--t-sm);
  font-weight: 500;
  color: var(--ink);
  cursor: pointer;
  max-width: 340px;
}

.toast.ok :deep(svg) {
  color: var(--ok-bright);
}
.toast.fail :deep(svg) {
  color: var(--fail-bright);
}
.toast.info :deep(svg) {
  color: var(--ink-3);
}

.toast :deep(svg) {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s var(--ease-out), transform 0.2s var(--ease-out);
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(12px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
</style>
