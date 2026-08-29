<script setup lang="ts">
/**
 * Pixel comparison of two images.
 *
 * Decoding and drawing happen here; the comparison itself lives in
 * `lib/imageDiff.ts`. The two images are drawn at the *larger* of the two
 * sizes rather than being squashed to match: scaling one to fit the other
 * would invent differences along every edge, which is exactly the noise the
 * threshold is there to keep out.
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import SourceTray from "../../work/SourceTray.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { errText } from "../../lib/err";
import { fileToBlobURL, formatBytes } from "../../lib/backend";
import { IMAGE_EXT } from "../../lib/tools";
import { pixelDiff, percent, type DiffStats, type Overlay } from "../../lib/imageDiff";
import type { FileInfo } from "@bindings/hitool/services/models";

const files = ref<FileInfo[]>([]);
const threshold = ref(2);
const overlay = ref<Overlay>("mark");
const busy = ref(false);
const error = ref("");
const stats = ref<DiffStats | null>(null);
const outUrl = ref("");
const sizes = ref<{ w: number; h: number }[]>([]);

const canvas = ref<HTMLCanvasElement | null>(null);

const pair = computed(() => files.value.slice(0, 2));
const ready = computed(() => pair.value.length === 2);
const mismatched = computed(
  () => sizes.value.length === 2 && (sizes.value[0].w !== sizes.value[1].w || sizes.value[0].h !== sizes.value[1].h),
);

function release() {
  if (outUrl.value) URL.revokeObjectURL(outUrl.value);
  outUrl.value = "";
}

onBeforeUnmount(release);

async function load(f: FileInfo): Promise<HTMLImageElement> {
  const url = await fileToBlobURL(f.path, "image/*");
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(t("imgdiff.decodeFailed", { name: f.name })));
      img.src = url;
    });
  } finally {
    // The bitmap is already decoded into the element; the blob is not needed
    // past that, and holding on to two of them per run adds up.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Draw one image onto a w×h canvas, top-left aligned, and read it back. */
function rasterise(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}

async function run() {
  if (!ready.value || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const [a, b] = await Promise.all(pair.value.map(load));
    sizes.value = [
      { w: a.naturalWidth, h: a.naturalHeight },
      { w: b.naturalWidth, h: b.naturalHeight },
    ];
    const w = Math.max(a.naturalWidth, b.naturalWidth);
    const h = Math.max(a.naturalHeight, b.naturalHeight);
    if (!w || !h) throw new Error(t("imgdiff.empty"));

    const result = pixelDiff(rasterise(a, w, h), rasterise(b, w, h), w, h, {
      threshold: threshold.value / 100,
      overlay: overlay.value,
    });
    stats.value = result.stats;

    const c = canvas.value ?? document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    // Built through createImageData rather than `new ImageData(buffer, …)`:
    // the constructor insists on a buffer it owns, and this copies into one.
    const out = ctx.createImageData(w, h);
    out.data.set(result.overlay);
    ctx.putImageData(out, 0, 0);
    release();
    await new Promise<void>((resolve) =>
      c.toBlob((blob) => {
        if (blob) outUrl.value = URL.createObjectURL(blob);
        resolve();
      }, "image/png"),
    );
  } catch (e) {
    error.value = errText(e);
    stats.value = null;
  } finally {
    busy.value = false;
  }
}

watch([files, threshold, overlay], () => {
  if (ready.value) run();
  else {
    stats.value = null;
    sizes.value = [];
    release();
  }
});
</script>

<template>
  <ToolFrame tool-id="image-diff" shape="flow">
    <div class="field">
      <span class="lab">{{ t("imgdiff.pick") }}</span>
      <SourceTray v-model="files" :accept="IMAGE_EXT" :multiple="true" filter-name="Images" />
      <p class="hint">{{ t("imgdiff.pickHint") }}</p>
    </div>

    <div v-if="pair.length" class="pairinfo">
      <div v-for="(f, i) in pair" :key="f.path" class="pf">
        <span class="badge">{{ i === 0 ? "A" : "B" }}</span>
        <span class="pname truncate" :title="f.path">{{ f.name }}</span>
        <span class="lab">{{ formatBytes(f.size) }}</span>
        <span v-if="sizes[i]" class="lab mono">{{ sizes[i].w }}×{{ sizes[i].h }}</span>
      </div>
    </div>

    <p v-if="mismatched" class="banner warn">{{ t("imgdiff.sizeWarn") }}</p>
    <p v-if="error" class="banner fail">{{ error }}</p>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("imgdiff.result") }}</span>
        <template v-if="stats">
          <span class="badge" :class="stats.changedPixels ? 'fail' : 'ok'">
            {{ stats.changedPixels ? percent(stats.changedRatio) : t("imgdiff.same") }}
          </span>
          <span class="lab mono">{{ stats.changedPixels.toLocaleString() }} px</span>
        </template>
        <span v-if="busy" class="lab">{{ t("imgdiff.working") }}</span>
      </div>

      <div class="view scroll-y">
        <img v-if="outUrl" :src="outUrl" class="out" :alt="t('imgdiff.result')" />
        <p v-else class="hint pad">{{ t("imgdiff.idle") }}</p>
        <canvas ref="canvas" class="hidden" />
      </div>

      <div v-if="stats" class="statbar">
        <span><span class="lab">{{ t("imgdiff.maxDelta") }}</span> {{ percent(stats.maxDelta) }}</span>
        <span><span class="lab">{{ t("imgdiff.meanDelta") }}</span> {{ percent(stats.meanDelta) }}</span>
        <span v-if="stats.box">
          <span class="lab">{{ t("imgdiff.box") }}</span>
          <span class="mono">{{ stats.box.x }},{{ stats.box.y }} {{ stats.box.w }}×{{ stats.box.h }}</span>
        </span>
      </div>
    </template>

    <template #inspector>
      <InspectorSection :title="t('imgdiff.threshold')" icon="SlidersHorizontal" :open="true">
        <input v-model.number="threshold" type="range" min="0" max="20" step="1" class="slider" />
        <div class="thline">
          <span class="mono">{{ threshold }}%</span>
          <span class="hint">{{ threshold === 0 ? t("imgdiff.thStrict") : t("imgdiff.thLoose") }}</span>
        </div>
        <p class="hint">{{ t("imgdiff.thHint") }}</p>
      </InspectorSection>

      <InspectorSection :title="t('imgdiff.overlay')" icon="Layers">
        <div class="chips">
          <button
            v-for="m in (['mark', 'heat', 'onlyDiff'] as const)"
            :key="m"
            class="chip"
            :class="{ on: overlay === m }"
            @click="overlay = m"
          >
            {{ t(`imgdiff.o_${m}`) }}
          </button>
        </div>
        <p class="hint">{{ t("imgdiff.overlayHint") }}</p>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
.pairinfo {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.pf {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--t-sm);
}

.pname {
  flex: 1;
  min-width: 0;
}

.res-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.view {
  flex: 1;
  padding: 12px;
  display: grid;
  place-items: center;
  /* Chequerboard, so a transparent overlay is visibly transparent. */
  background-image: linear-gradient(45deg, var(--s-3) 25%, transparent 25%),
    linear-gradient(-45deg, var(--s-3) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--s-3) 75%),
    linear-gradient(-45deg, transparent 75%, var(--s-3) 75%);
  background-size: 14px 14px;
  background-position: 0 0, 0 7px, 7px -7px, -7px 0;
}

.out {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  border-radius: var(--r-sm);
}

.hidden {
  display: none;
}

.pad {
  padding: 12px;
}

.statbar {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  padding: 9px 14px;
  border-top: 1px solid var(--line);
  font-size: var(--t-xs);
  flex-shrink: 0;
}

.thline {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 4px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
</style>
