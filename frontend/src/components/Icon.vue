<script setup lang="ts">
import { computed } from "vue";
import { iconByName } from "../lib/icons";

const props = defineProps<{ name: string }>();

// Resolve a lucide component from its exported name; the registry falls back to
// a box. Names come from lib/icons.ts rather than a barrel import so the
// bundler can drop the ~5000 icons this app never draws.
const comp = computed(() => iconByName(props.name));
</script>

<template>
  <!-- Icons are decorative; adjacent text or button titles carry the label. -->
  <component :is="comp" aria-hidden="true" />
</template>
