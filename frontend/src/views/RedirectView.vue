<script setup lang="ts">
/**
 * Boot-time redirect: lands on the most recently used tool, or falls back
 * to the first tool in the catalogue when there is no history yet.
 */
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { TOOLS } from "../lib/tools";
import * as StoreService from "@bindings/hitool/services/storeservice";
import { inWails } from "../lib/backend";

const router = useRouter();

onMounted(async () => {
  // Try to load the last-used tool from history.
  if (inWails()) {
    try {
      const rows = await StoreService.GetHistory(1);
      if (rows?.[0]?.tool) {
        router.replace(`/t/${rows[0].tool}`);
        return;
      }
    } catch {
      /* fall through to default */
    }
  }

  // No history — open the very first tool in the catalogue.
  const first = TOOLS[0];
  if (first) {
    router.replace(`/t/${first.id}`);
  } else {
    // Safety net: should never happen with a healthy manifest.
    router.replace("/");
  }
});
</script>

<template>
  <div class="redirect" />
</template>

<style scoped>
.redirect {
  flex: 1;
  min-height: 0;
}
</style>
