<script setup lang="ts">
/**
 * Compatibility wrapper: v0.3's free-form page is now just ToolFrame in its
 * single-column shape. Kept so the twelve calculator/text/AI views migrate
 * without each needing an edit; new tools should use ToolFrame directly.
 */
import ToolFrame from "./ToolFrame.vue";

const props = withDefaults(
  defineProps<{ toolId: string; wide?: boolean }>(),
  { wide: false },
);
</script>

<template>
  <ToolFrame :tool-id="props.toolId" :shape="props.wide ? 'flow' : 'single'">
    <template v-if="$slots['head-extra']" #actions>
      <slot name="head-extra" />
    </template>
    <slot />
  </ToolFrame>
</template>
