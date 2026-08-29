<script setup lang="ts">
/**
 * The one frame every tool renders inside. Replaces v0.3's split between a
 * rigid three-column bench and a max-width panel page.
 *
 * `shape` decides how the work area is divided:
 *   flow   — two panes, input ↔ result, full window width (text tools)
 *   batch  — a source list beside the work area (file tools)
 *   single — one centred column (calculators, short forms)
 *
 * Secondary controls go in the `inspector` slot, which renders in the
 * right-hand drawer rather than stacking above the work area.
 */
import { computed, onBeforeUnmount, useSlots, watchEffect } from "vue";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import { t, lang } from "../lib/i18n";
import { inspectorHasContent, inspectorOpen, toggleInspector } from "../stores/inspector";

const props = withDefaults(
  defineProps<{ toolId: string; shape?: "flow" | "batch" | "single" }>(),
  { shape: "single" },
);

const router = useRouter();
const slots = useSlots();

const title = computed(() => {
  void lang.value;
  return t(`tools.${props.toolId}.name`);
});
const desc = computed(() => {
  void lang.value;
  return t(`tools.${props.toolId}.desc`);
});

const hasInspector = computed(() => !!slots.inspector);

// Tell the shell whether the drawer has anything to show for this tool.
watchEffect(() => {
  inspectorHasContent.value = hasInspector.value;
});
onBeforeUnmount(() => {
  inspectorHasContent.value = false;
});
</script>

<template>
  <div class="frame">
    <header class="head">
      <button class="btn btn-sm btn-quiet btn-icon" :title="t('common.back')" @click="router.back()">
        <Icon name="ArrowLeft" />
      </button>
      <div class="titles">
        <h1>{{ title }}</h1>
        <p class="desc truncate">{{ desc }}</p>
      </div>
      <div class="head-actions">
        <slot name="actions" />
        <button
          v-if="hasInspector"
          class="btn btn-sm btn-quiet btn-icon"
          :class="{ on: inspectorOpen }"
          :title="t('common.inspector')"
          @click="toggleInspector"
        >
          <Icon name="PanelRight" />
        </button>
      </div>
    </header>

    <!-- Optional full-width band under the header: notices, status. -->
    <div v-if="slots.notice" class="notice">
      <slot name="notice" />
    </div>

    <div class="body">
      <div class="work" :class="[`shape-${props.shape}`, { dual: !!slots.result }]">
        <!-- batch: the files you fed in, pinned to a narrow left column -->
        <aside v-if="props.shape === 'batch' && slots.source" class="source scroll-y">
          <slot name="source" />
        </aside>

        <section class="pane-main scroll-y">
          <div class="pane-inner" :class="{ narrow: props.shape === 'single' }">
            <slot />
          </div>
        </section>

        <!-- Results take the *remaining* width rather than a fixed third:
             a file list or a formatted document benefits from room, and an
             empty settings column shouldn't reserve any. -->
        <section v-if="slots.result" class="pane-result">
          <slot name="result" />
        </section>
      </div>

      <aside v-if="hasInspector && inspectorOpen" class="inspector scroll-y">
        <slot name="inspector" />
      </aside>
    </div>

    <!-- Sticky action bar, for tools with a single primary action. -->
    <footer v-if="slots.run" class="runbar">
      <slot name="run" />
    </footer>
  </div>
</template>

<style scoped>
/* v0.6 Candy canvas: the tool header sits on the tinted ground and every
   working pane floats as a white card — depth comes from elevation,
   separation from gaps instead of hairlines. */
.frame {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  flex-shrink: 0;
}

/* One compact line — title, then the description trailing with ellipsis —
   so the work area keeps the vertical room a two-row header ate. */
.titles {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.titles h1 {
  font-size: var(--t-lg);
  font-weight: 750;
  letter-spacing: -0.015em;
  white-space: nowrap;
}

.desc {
  flex: 1;
  min-width: 0;
  font-size: var(--t-sm);
  color: var(--ink-3);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
}

.head-actions .btn.on {
  background: var(--acc-wash);
  color: var(--acc);
}

.notice {
  padding: 0 20px 4px;
  flex-shrink: 0;
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  padding: 6px 16px 14px;
  position: relative;
}

.work {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 12px;
}

/* Shared card face for all working panes. */
.source,
.pane-main,
.pane-result,
.inspector {
  background: var(--s-1);
  border: 1px solid var(--line-2);
  border-radius: var(--r-lg);
  box-shadow: var(--e-1);
}

/* batch source column */
.source {
  width: 300px;
  flex-shrink: 0;
  background: var(--s-2);
  box-shadow: none;
  padding: 14px;
}

.pane-main {
  min-width: 0;
  flex: 1;
  padding: 18px 16px 26px;
}

/* In a batch tool the settings are a short form — give them a readable
   fixed column instead of letting them stretch across the window. */
.shape-batch > .pane-main {
  flex: 0 0 400px;
}

/* Only split when there is actually a result pane to split with; a flow tool
   without one gets the whole width rather than a 50% column and dead space. */
.shape-flow.dual > .pane-main {
  flex: 1 1 50%;
}

.shape-flow:not(.dual) > .pane-main > .pane-inner {
  max-width: 1100px;
}

.pane-result {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pane-inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Flow tools are usually one tall editor plus a couple of controls; give the
   column a definite height so a `flex: 1` field actually fills the pane
   instead of sitting at its min-height with dead space underneath. */
.shape-flow > .pane-main > .pane-inner {
  min-height: 100%;
}

/* single-column tools stay readable instead of stretching to 1900px; inside
   the floating card they read as inset groups. */
.pane-inner.narrow {
  max-width: 720px;
  margin: 0 auto;
  background: var(--s-2);
  border-radius: var(--r-xl);
  padding: 22px;
}

.inspector {
  width: var(--insp-w);
  flex-shrink: 0;
  overflow-y: auto;
}

.runbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--line-2);
  background: var(--chrome);
  backdrop-filter: blur(var(--chrome-blur)) saturate(1.5);
  -webkit-backdrop-filter: blur(var(--chrome-blur)) saturate(1.5);
}

/* Below this width the inspector and source column would leave nothing for
   the work area, so they shrink first. */
@media (max-width: 1080px) {
  .inspector {
    width: 250px;
  }
  .source {
    width: 236px;
  }
}

@media (max-width: 1240px) {
  .shape-batch > .pane-main {
    flex: 0 0 340px;
  }
}

/* The inspector stops reserving width and floats over the work area
   instead — closing it gives the space straight back. */
@media (max-width: 960px) {
  .inspector {
    position: absolute;
    top: 6px;
    right: 16px;
    bottom: 14px;
    z-index: 30;
    width: min(var(--insp-w), 82%);
    box-shadow: var(--e-3);
    animation: insp-in 0.24s var(--ease-out);
  }
}

@keyframes insp-in {
  from {
    opacity: 0;
    transform: translateX(14px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* Below this the columns would each be too narrow to work in, so the whole
   body stacks and each region scrolls on its own. */
@media (max-width: 860px) {
  .body,
  .work {
    flex-direction: column;
  }
  .source,
  .shape-batch > .pane-main,
  .shape-flow > .pane-main {
    width: 100%;
    flex: 0 0 auto;
  }
  .pane-result {
    min-height: 260px;
  }
  /* Stacked, the overlay inspector makes no sense — it docks back in. */
  .inspector {
    position: static;
    width: 100%;
    max-height: 40vh;
    box-shadow: none;
    animation: none;
  }
}
</style>
