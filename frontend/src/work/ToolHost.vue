<script setup lang="ts">
/**
 * One route serves all tools: manifest tools go to the generic runner, the
 * rest resolve to their own component.
 *
 * KeepAlive lives *here*, not around the router-view. Because every tool
 * shares the `/t/:id` route, caching at the router level would only ever
 * cache this host — the tool inside would still be torn down on each switch.
 * Keying the cache by tool id is what actually makes tabs keep their state.
 */
import { computed, defineAsyncComponent, markRaw, watchEffect, type Component } from "vue";
import { useRoute, useRouter } from "vue-router";
import { bespokeLoader } from "../tools/bespoke";
import { aliasQuery, canonicalToolId, toolIdOfPath } from "../lib/tools";
import { manifestFor } from "../tools/manifest";
import ToolRunner from "./ToolRunner.vue";

const route = useRoute();
const router = useRouter();

const toolId = computed(() => toolIdOfPath(route.path));

// Async wrappers are memoised so a tool always resolves to the *same*
// component object; KeepAlive matches on identity as well as on key.
const resolved = new Map<string, Component>();

function componentFor(id: string): Component | null {
  const loader = bespokeLoader(id);
  if (!loader) return null;
  if (!resolved.has(id)) {
    resolved.set(id, markRaw(defineAsyncComponent(loader as never)));
  }
  return resolved.get(id)!;
}

const bespoke = computed(() => (toolId.value ? componentFor(toolId.value) : null));
const manifest = computed(() => !!manifestFor(toolId.value));

// Retired ids redirect onto the tool that absorbed them, keeping query
// so JWT "sign" / AI "translate" still open on the right mode.
watchEffect(() => {
  const id = toolId.value;
  if (!id) return;
  const canon = canonicalToolId(id);
  if (canon !== id) {
    router.replace({ path: `/t/${canon}`, query: { ...route.query, ...aliasQuery(id) } });
    return;
  }
  if (!bespoke.value && !manifest.value) router.replace("/");
});
</script>

<template>
  <KeepAlive :max="14">
    <component :is="bespoke" v-if="bespoke" :key="toolId" />
    <ToolRunner v-else-if="manifest" :key="toolId" />
  </KeepAlive>
</template>
