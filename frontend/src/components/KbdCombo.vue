<script setup lang="ts">
import { computed } from "vue";
import { comboText } from "../lib/shortcuts";

const props = defineProps<{ combo: string }>();
const label = computed(() => comboText(props.combo));
</script>

<template>
  <kbd>{{ label }}</kbd>
</template>
