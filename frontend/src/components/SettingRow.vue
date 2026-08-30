<script setup lang="ts">
/**
 * One setting per row: what it is on the left, the control that changes it on
 * the right, hairline between rows. The alternative — the wrapped grid of
 * labelled widgets this panel used to be — leaves the eye hunting for which
 * caption belongs to which control once a section holds more than two.
 *
 * `stack` is for controls too wide to sit beside a label (a list of key
 * bindings, a search field with buttons): the row keeps its heading and lets
 * the control have the full width underneath.
 */
defineProps<{ title: string; desc?: string; stack?: boolean }>();
</script>

<template>
  <div class="srow" :class="{ stack }">
    <div class="txt">
      <span class="name">{{ title }}</span>
      <span v-if="desc" class="desc">{{ desc }}</span>
    </div>
    <div class="ctl"><slot /></div>
  </div>
</template>

<style scoped>
.srow {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line-2);
}

.srow:last-child {
  border-bottom: 0;
}

.txt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name {
  font-size: var(--t-sm);
  font-weight: 550;
  color: var(--ink);
}

.desc {
  font-size: var(--t-xs);
  line-height: 1.5;
  color: var(--ink-3);
}

.ctl {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: auto;
}

.srow.stack {
  flex-direction: column;
  align-items: stretch;
  gap: 9px;
}

.srow.stack .ctl {
  margin-left: 0;
  justify-content: flex-start;
}
</style>
