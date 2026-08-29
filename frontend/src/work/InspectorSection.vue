<script setup lang="ts">
/** One collapsible block inside the inspector drawer. */
import { ref } from "vue";
import Icon from "../components/Icon.vue";

const props = withDefaults(
  defineProps<{ title: string; icon?: string; open?: boolean; count?: number | string }>(),
  { icon: "", open: true },
);

const expanded = ref(props.open);
</script>

<template>
  <section class="sec" :class="{ open: expanded }">
    <button class="sec-head" @click="expanded = !expanded">
      <Icon name="ChevronRight" class="caret" />
      <Icon v-if="props.icon" :name="props.icon" class="sec-icon" />
      <span class="sec-title">{{ props.title }}</span>
      <span v-if="props.count !== undefined" class="badge">{{ props.count }}</span>
    </button>
    <div v-if="expanded" class="sec-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.sec {
  border-bottom: 1px solid var(--line-2);
}

.sec-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-family: var(--f-ui);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.sec-head:hover {
  background: var(--hover);
}

.caret {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: var(--ink-3);
  transition: transform 0.16s var(--ease-out);
}

.sec.open .caret {
  transform: rotate(90deg);
}

.sec-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--ink-3);
}

.sec-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sec-body {
  padding: 2px 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
</style>
