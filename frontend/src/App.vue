<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppShell from "./layout/AppShell.vue";
import ToastDock from "./layout/ToastDock.vue";
import Onboarding from "./components/Onboarding.vue";
import { onboardingDone } from "./lib/onboarding";

/** First-run tour shows once; the flag is persisted when it finishes. */
const showOnb = ref(false);
onMounted(async () => {
  if (!(await onboardingDone())) showOnb.value = true;
});
</script>

<template>
  <AppShell />
  <ToastDock />
  <Onboarding v-if="showOnb" @done="showOnb = false" />
</template>
