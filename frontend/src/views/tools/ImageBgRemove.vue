<script setup lang="ts">
/**
 * Knock-out a background colour: click the preview to pick the colour (or
 * type hex), tune tolerance, watch a live keyed preview, then export the
 * full-resolution PNG with transparency.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import WorkBench from "../../work/WorkBench.vue";
import SourceTray from "../../work/SourceTray.vue";
import OutputList from "../../work/OutputList.vue";
import Icon from "../../components/Icon.vue";
import KbdCombo from "../../components/KbdCombo.vue";
import { t } from "../../lib/i18n";
import { errText } from "../../lib/err";
import { outputDir, readFileBytes, writeFileChunked, baseName, pickDirectory } from "../../lib/backend";
import { IMAGE_EXT } from "../../lib/tools";
import { parseHexColor, removeColorKey } from "../../lib/colorKey";
import { addOutput, finishJob, setProgress, startJob, type Job } from "../../stores/jobs";
import * as StoreService from "@bindings/hitool/services/storeservice";
import type { FileInfo } from "@bindings/hitool/services/models";

const files = ref<FileInfo[]>([]);
const hex = ref("#ffffff");
const tolerance = ref(40);
const picked = ref<string | null>(null);
const lastResult = ref("");
const outDir = ref("");
const busy = ref(false);
const job = ref<Job>();

const previewCanvas = ref<HTMLCanvasElement>();
const fullCanvas = ref<HTMLCanvasElement | null>(null);

const keyColor = computed(() => parseHexColor(hex.value));
const canRun = computed(
  () => files.value.length > 0 && !busy.value && !!fullCanvas.value && !!keyColor.value,
);

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    run();
  }
}

onMounted(async () => {
  outDir.value = await outputDir("Images");
  window.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  fullCanvas.value = null;
});

async function loadImage() {
  fullCanvas.value = null;
  picked.value = null;
  lastResult.value = "";
  if (!files.value.length) return;
  try {
    const bytes = await readFileBytes(files.value[0].path);
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));

    const full = document.createElement("canvas");
    full.width = bitmap.width;
    full.height = bitmap.height;
    full.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    fullCanvas.value = full;

    renderPreview();
  } catch {
    /* surfaced again on run */
  }
}

/** Downscaled copy with the key applied, for instant feedback. */
function renderPreview() {
  const canvas = previewCanvas.value;
  const full = fullCanvas.value;
  if (!canvas || !full || !keyColor.value) return;
  const scale = Math.min(1, 480 / Math.max(full.width, full.height));
  canvas.width = Math.max(1, Math.round(full.width * scale));
  canvas.height = Math.max(1, Math.round(full.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  removeColorKey(img.data, keyColor.value, tolerance.value);
  ctx.putImageData(img, 0, 0);
}

/** Click-to-pick: translate the click into natural pixels and read them. */
function pickAt(e: MouseEvent) {
  const canvas = previewCanvas.value;
  const full = fullCanvas.value;
  if (!canvas || !full) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.min(full.width - 1, Math.floor(((e.clientX - rect.left) / rect.width) * full.width));
  const y = Math.min(full.height - 1, Math.floor(((e.clientY - rect.top) / rect.height) * full.height));
  const px = full.getContext("2d")!.getImageData(x, y, 1, 1).data;
  hex.value =
    "#" + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
  picked.value = hex.value;
}

watch(files, loadImage);
watch([hex, tolerance], renderPreview);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  const input = files.value[0];
  const j = startJob({
    tool: "image-bg-remove",
    label: `${t("tools.image-bg-remove.name")} · ${input.name}`,
    total: 1,
    outputDir: outDir.value,
  });
  job.value = j;

  try {
    setProgress(j, 0, 1, t("bgr.keying"));
    const full = fullCanvas.value!;
    const ctx = full.getContext("2d", { willReadFrequently: true })!;
    const img = ctx.getImageData(0, 0, full.width, full.height);
    const res = removeColorKey(img.data, keyColor.value!, tolerance.value);
    ctx.putImageData(img, 0, 0);

    const blob: Blob = await new Promise((r) => full.toBlob((b) => r(b!), "image/png"));
    const outPath = `${outDir.value}/${baseName(input.path).replace(/\.[a-z0-9]+$/i, "")}_keyed.png`;
    await writeFileChunked(outPath, new Uint8Array(await blob.arrayBuffer()));
    await StoreService.AddHistory("image-bg-remove", baseName(outPath)).catch(() => {});

    setProgress(j, 1, 1);
    lastResult.value = t("bgr.done", { n: res.removed });
    addOutput(j, {
      path: outPath,
      name: baseName(outPath),
      detail: lastResult.value,
      ok: res.removed > 0,
    });
    finishJob(j, "done");
  } catch (e) {
    finishJob(j, "failed", errText(e));
  } finally {
    busy.value = false;
  }
}

async function browse() {
  const d = await pickDirectory(t("bench.chooseOutput"));
  if (d) outDir.value = d;
}
</script>

<template>
  <WorkBench tool-id="image-bg-remove" :files="files">
    <template #source>
      <SourceTray v-model="files" :accept="IMAGE_EXT" filter-name="Images" :multiple="false" :disabled="busy" />
    </template>

    <template #settings>
      <div class="field">
        <span class="lab">{{ t("bgr.color") }}</span>
        <div class="color-row">
          <input
            v-model="hex"
            class="input mono"
            spellcheck="false"
            placeholder="#ffffff"
          />
          <span class="swatch" :style="{ background: keyColor ? hex : 'transparent' }"></span>
        </div>
        <p class="hint">{{ t("bgr.pickHint") }}</p>
      </div>

      <div class="field">
        <span class="lab">{{ t("bgr.tolerance") }} · {{ tolerance }}</span>
        <input v-model.number="tolerance" type="range" min="1" max="150" step="1" />
      </div>

      <div v-if="fullCanvas" class="peek checkers">
        <canvas ref="previewCanvas" class="peek-canvas" @click="pickAt"></canvas>
      </div>
      <p v-else-if="files.length" class="hint">{{ t("bgr.loading") }}</p>

      <div class="field">
        <span class="lab">{{ t("bench.outputDir") }}</span>
        <div class="dir">
          <span class="dir-path mono truncate" :title="outDir">{{ outDir || "—" }}</span>
          <button class="btn btn-sm btn-quiet" @click="browse">{{ t("bench.change") }}</button>
        </div>
      </div>
    </template>

    <template #run>
      <button class="btn btn-signal run" :disabled="!canRun" @click="run">
        <Icon v-if="busy" name="LoaderCircle" class="spin" />
        <Icon v-else name="Wand2" />
        {{ busy ? t("common.processing") : t("bgr.run") }}
        <KbdCombo v-if="!busy" combo="mod+enter" />
      </button>
      <p v-if="!busy && !files.length" class="hint">{{ t("bench.needFile") }}</p>
      <p v-else-if="!busy && !keyColor" class="hint warn">{{ t("bgr.badHex") }}</p>
    </template>

    <template #output>
      <OutputList :job="job" />
    </template>
  </WorkBench>
</template>

<style scoped>
.run {
  min-width: 168px;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-row .input {
  width: 120px;
}

.swatch {
  width: 24px;
  height: 24px;
  border: 1px solid var(--line);
  border-radius: 6px;
}

.peek {
  display: flex;
  justify-content: center;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.checkers {
  background-image:
    linear-gradient(45deg, var(--s-3) 25%, transparent 25%, transparent 75%, var(--s-3) 75%),
    linear-gradient(45deg, var(--s-3) 25%, transparent 25%, transparent 75%, var(--s-3) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 8px 8px;
}

.peek-canvas {
  max-width: 100%;
  max-height: 220px;
  cursor: crosshair;
}

.warn {
  color: var(--warn);
}

.dir {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 4px 0 9px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-2);
}

.dir-path {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--ink-2);
  direction: rtl;
  text-align: left;
}
</style>
