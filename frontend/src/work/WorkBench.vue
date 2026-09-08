<script setup lang="ts">
/**
 * Compatibility wrapper: v0.3's rigid three-column bench is now ToolFrame in
 * its batch shape. Kept so the four bespoke file tools migrate without each
 * needing an edit; new tools should use ToolFrame directly.
 */
import ToolFrame from "./ToolFrame.vue";
import type { FileInfo } from "@bindings/hitool/services/models";

const props = defineProps<{ toolId: string; files?: FileInfo[]; noSource?: boolean }>();
</script>

<template>
  <ToolFrame :tool-id="props.toolId" shape="batch">
    <template v-if="$slots['head-extra']" #actions>
      <slot name="head-extra" />
    </template>
    <template v-if="!props.noSource" #source>
      <slot name="source" />
    </template>

    <slot name="settings" />

    <template v-if="$slots.output" #result>
      <slot name="output" />
    </template>
    <template v-if="$slots.run" #run>
      <slot name="run" />
    </template>
  </ToolFrame>
</template>
