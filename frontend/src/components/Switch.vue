<script setup lang="ts">
/**
 * A two-state toggle, rendered as a real `role="switch"` button rather than a
 * restyled checkbox: the knob has to slide, and a checkbox's own box is
 * awkward to suppress consistently. A <button> brings Space, Enter and the
 * focus ring along for free; `aria-checked` is what a screen reader announces.
 */
defineProps<{
  modelValue: boolean;
  disabled?: boolean;
  /** Announced name, for the callers that don't wrap this in a <label>. */
  label?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [boolean] }>();
</script>

<template>
  <button
    type="button"
    role="switch"
    class="sw"
    :class="{ on: modelValue }"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="knob" />
  </button>
</template>

<style scoped>
.sw {
  flex-shrink: 0;
  position: relative;
  width: 36px;
  height: 21px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--s-3);
  cursor: pointer;
  transition: background 0.18s var(--ease), border-color 0.18s var(--ease);
}

.sw:hover:not(:disabled) {
  border-color: var(--line-strong);
}

.sw.on {
  background: var(--acc);
  border-color: var(--acc);
}

.sw.on:hover:not(:disabled) {
  background: var(--acc-hover);
  border-color: var(--acc-hover);
}

.sw:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.sw:focus-visible {
  border-radius: var(--r-pill);
}

.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--s-1);
  box-shadow: 0 1px 2px rgba(27, 45, 98, 0.28);
  transition: transform 0.18s var(--ease-out);
}

.sw.on .knob {
  transform: translateX(15px);
  /* The knob rides on the accent fill, so it keeps its own light surface in
     both themes instead of following --s-1 into the dark palette. */
  background: #fff;
}

@media (prefers-reduced-motion: reduce) {
  .sw,
  .knob {
    transition: none;
  }
}
</style>
