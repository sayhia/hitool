<script setup lang="ts">
import { computed } from "vue";
import * as icons from "lucide-vue-next";

const props = defineProps<{ name: string }>();

// Resolve a lucide component from its exported name; fall back to a box.
const comp = computed(() => {
  const c = (icons as Record<string, unknown>)[props.name];
  return (c as object) ?? icons.Box;
});
</script>

<template>
  <!-- Icons are decorative; adjacent text or button titles carry the label. -->
  <component :is="comp" aria-hidden="true" />
</template>
