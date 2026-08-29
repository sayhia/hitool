<script setup lang="ts">
/**
 * Crops an image either to a centered aspect preset or to exact pixel
 * coordinates. The preview draws the live crop box over the source so the
 * numbers stay legible without a heavyweight drag UI.
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
import { centerAspectCrop, clampRect, type CropRect } from "../../lib/cropRect";
import { addOutput, finishJob, setProgress, startJob, type Job } from "../../stores/jobs";
import * as StoreService from "@bindings/hitool/services/storeservice";
import type { FileInfo } from "@bindings/hitool/services/models";

const RATIOS: { id: string; w: number; h: number }[] = [
  { id: "1:1", w: 1, h: 1 },
  { id: "4:3", w: 4, h: 3 },
  { id: "3:4", w: 3, h: 4 },
  { id: "3:2", w: 3, h: 2 },
  { id: "16:9", w: 16, h: 9 },
  { id: "9:16", w: 9, h: 16 },
];

const files = ref<FileInfo[]>([]);
const preview = ref("");
const natW = ref(0);
const natH = ref(0);
const mode = ref<"aspect" | "custom">("aspect");
const ratio = ref("1:1");
const cx = ref(0);
const cy = ref(0);
const cw = ref(0);
const ch = ref(0);
const outDir = ref("");
const busy = ref(false);
const job = ref<Job>();

const canRun = computed(() => files.value.length > 0 && !busy.value && natW.value > 0);

const rect = computed<CropRect>(() => {
  if (!natW.value) return { x: 0, y: 0, w: 0, h: 0 };
  if (mode.value === "aspect") {
    const r = RATIOS.find((r) => r.id === ratio.value) ?? RATIOS[0];
    return centerAspectCrop(natW.value, natH.value, r.w, r.h);
  }
  return clampRect({ x: cx.value, y: cy.value, w: cw.value, h: ch.value }, natW.value, natH.value);
});

/** Crop box scaled onto the preview thumbnail. */
const box = computed(() => {
  if (!natW.value || !preview.value) return null;
  return {
    left: `${(rect.value.x / natW.value) * 100}%`,
    top: `${(rect.value.y / natH.value) * 100}%`,
    width: `${(rect.value.w / natW.value) * 100}%`,
    height: `${(rect.value.h / natH.value) * 100}%`,
  };
});

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

onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

async function loadPreview() {
  preview.value = "";
  natW.value = 0;
  if (!files.value.length) return;
  try {
    const bytes = await readFileBytes(files.value[0].path);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
    const img = new Image();
    img.onload = () => {
      natW.value = img.naturalWidth;
      natH.value = img.naturalHeight;
      cx.value = 0;
      cy.value = 0;
      cw.value = img.naturalWidth;
      ch.value = img.naturalHeight;
      preview.value = url;
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  } catch {
    /* preview is best-effort; the run path reads the file again */
  }
}

watch(files, loadPreview);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  const input = files.value[0];
  const r = rect.value;
  const j = startJob({
    tool: "image-crop",
    label: `${t("tools.image-crop.name")} · ${input.name}`,
    total: 1,
    outputDir: outDir.value,
  });
  job.value = j;

  try {
    setProgress(j, 0, 1, t("crop.cutting"));
    const bytes = await readFileBytes(input.path);
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
    const safe = clampRect(r, bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = safe.w;
    canvas.height = safe.h;
    canvas.getContext("2d")!.drawImage(bitmap, safe.x, safe.y, safe.w, safe.h, 0, 0, safe.w, safe.h);
    bitmap.close();

    const isJpg = /\.jpe?g$/i.test(input.path);
    const blob: Blob = await new Promise((res) =>
      canvas.toBlob((b) => res(b!), isJpg ? "image/jpeg" : "image/png", 0.92),
    );
    const outPath = `${outDir.value}/${baseName(input.path).replace(/\.[a-z0-9]+$/i, "")}_cropped.${isJpg ? "jpg" : "png"}`;
    await writeFileChunked(outPath, new Uint8Array(await blob.arrayBuffer()));
    await StoreService.AddHistory("image-crop", baseName(outPath)).catch(() => {});

    setProgress(j, 1, 1);
    addOutput(j, {
      path: outPath,
      name: baseName(outPath),
      detail: `${safe.w}×${safe.h}px`,
      ok: true,
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
  <WorkBench tool-id="image-crop" :files="files">
    <template #source>
      <SourceTray v-model="files" :accept="IMAGE_EXT" filter-name="Images" :multiple="false" :disabled="busy" />
    </template>

    <template #settings>
      <div class="field">
        <span class="lab">{{ t("crop.mode") }}</span>
        <div class="seg">
          <button :class="{ on: mode === 'aspect' }" @click="mode = 'aspect'">{{ t("crop.aspect") }}</button>
          <button :class="{ on: mode === 'custom' }" @click="mode = 'custom'">{{ t("crop.custom") }}</button>
        </div>
      </div>

      <template v-if="mode === 'aspect'">
        <div class="field">
          <span class="lab">{{ t("crop.ratio") }}</span>
          <div class="seg wrap">
            <button v-for="r in RATIOS" :key="r.id" :class="{ on: ratio === r.id }" @click="ratio = r.id">
              {{ r.id }}
            </button>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="grid4">
          <label class="mini"><span>X</span><input v-model.number="cx" type="number" min="0" /></label>
          <label class="mini"><span>Y</span><input v-model.number="cy" type="number" min="0" /></label>
          <label class="mini"><span>{{ t("crop.w") }}</span><input v-model.number="cw" type="number" min="1" /></label>
          <label class="mini"><span>{{ t("crop.h") }}</span><input v-model.number="ch" type="number" min="1" /></label>
        </div>
      </template>

      <div v-if="preview" class="peek">
        <span class="peek-frame">
          <img :src="preview" alt="" />
          <div v-if="box" class="peek-box" :style="box"></div>
        </span>
      </div>
      <p v-if="natW" class="hint mono">
        {{ natW }}×{{ natH }} → {{ rect.w }}×{{ rect.h }}
      </p>

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
        <Icon v-else name="Crop" />
        {{ busy ? t("common.processing") : t("crop.run") }}
        <KbdCombo v-if="!busy" combo="mod+enter" />
      </button>
      <p v-if="!busy && !files.length" class="hint">{{ t("bench.needFile") }}</p>
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

.wrap {
  flex-wrap: wrap;
}

.grid4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.mini {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: var(--t-sm);
  color: var(--ink-3);
}

.mini input {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-2);
  color: var(--ink-1);
  font-size: var(--t-sm);
}

.peek {
  display: flex;
  justify-content: center;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-2);
}

.peek-frame {
  position: relative;
  display: inline-block;
  line-height: 0;
}

.peek-frame img {
  display: block;
  max-width: 100%;
  max-height: 180px;
}

.peek-box {
  position: absolute;
  border: 1.5px solid var(--acc);
  box-shadow: 0 0 0 999px rgb(0 0 0 / 0.35);
  pointer-events: none;
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
