<script setup lang="ts">
/**
 * Stacks a set of images into one long screenshot, vertically or
 * horizontally, with a configurable gap and background. Everything is drawn
 * onto a single canvas and exported as PNG.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import WorkBench from "../../work/WorkBench.vue";
import SourceTray from "../../work/SourceTray.vue";
import OutputList from "../../work/OutputList.vue";
import Icon from "../../components/Icon.vue";
import KbdCombo from "../../components/KbdCombo.vue";
import { t } from "../../lib/i18n";
import { errText } from "../../lib/err";
import { outputDir, readFileBytes, writeFileChunked, baseName, pickDirectory } from "../../lib/backend";
import { IMAGE_EXT } from "../../lib/tools";
import { addOutput, finishJob, setProgress, startJob, type Job } from "../../stores/jobs";
import * as StoreService from "@bindings/hitool/services/storeservice";
import type { FileInfo } from "@bindings/hitool/services/models";

const files = ref<FileInfo[]>([]);
const direction = ref<"vertical" | "horizontal">("vertical");
const gap = ref(0);
const bg = ref<"white" | "black" | "transparent">("white");
const outDir = ref("");
const busy = ref(false);
const job = ref<Job>();

const canRun = computed(() => files.value.length >= 2 && !busy.value);

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

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  const j = startJob({
    tool: "image-stitch",
    label: `${t("tools.image-stitch.name")} · ${files.value.length}`,
    total: files.value.length,
    outputDir: outDir.value,
  });
  job.value = j;

  try {
    const bitmaps: ImageBitmap[] = [];
    for (let i = 0; i < files.value.length; i++) {
      setProgress(j, i, files.value.length, t("stitch.loading", { n: i + 1, total: files.value.length }));
      const bytes = await readFileBytes(files.value[i].path);
      bitmaps.push(await createImageBitmap(new Blob([bytes as BlobPart])));
    }

    const g = Math.max(0, gap.value);
    const vertical = direction.value === "vertical";
    // The cross axis stretches to the widest/tallest frame.
    const cross = Math.max(...bitmaps.map((b) => (vertical ? b.width : b.height)));
    const main =
      bitmaps.reduce((acc, b) => acc + (vertical ? b.height : b.width), 0) +
      g * (bitmaps.length - 1);

    const canvas = document.createElement("canvas");
    canvas.width = vertical ? cross : main;
    canvas.height = vertical ? main : cross;
    const ctx = canvas.getContext("2d")!;
    if (bg.value !== "transparent") {
      ctx.fillStyle = bg.value === "white" ? "#ffffff" : "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    let at = 0;
    bitmaps.forEach((b) => {
      // Center smaller frames on the cross axis instead of stretching them.
      const x = vertical ? (cross - b.width) / 2 : at;
      const y = vertical ? at : (cross - b.height) / 2;
      ctx.drawImage(b, x, y);
      at += (vertical ? b.height : b.width) + g;
      b.close();
    });

    setProgress(j, files.value.length, files.value.length, t("stitch.building"));
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const outPath = `${outDir.value}/stitched_${stamp}.png`;
    await writeFileChunked(outPath, new Uint8Array(await blob.arrayBuffer()));
    await StoreService.AddHistory("image-stitch", baseName(outPath)).catch(() => {});

    addOutput(j, {
      path: outPath,
      name: baseName(outPath),
      detail: t("stitch.done", { n: bitmaps.length, w: canvas.width, h: canvas.height }),
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
  <WorkBench tool-id="image-stitch" :files="files">
    <template #source>
      <SourceTray v-model="files" :accept="IMAGE_EXT" filter-name="Images" :multiple="true" :ordered="true" :disabled="busy" />
    </template>

    <template #settings>
      <div class="field">
        <span class="lab">{{ t("stitch.direction") }}</span>
        <div class="seg">
          <button :class="{ on: direction === 'vertical' }" @click="direction = 'vertical'">
            {{ t("stitch.vertical") }}
          </button>
          <button :class="{ on: direction === 'horizontal' }" @click="direction = 'horizontal'">
            {{ t("stitch.horizontal") }}
          </button>
        </div>
      </div>

      <div class="field">
        <span class="lab">{{ t("stitch.gap") }} · {{ gap }}px</span>
        <input v-model.number="gap" type="range" min="0" max="120" step="2" />
      </div>

      <div class="field">
        <span class="lab">{{ t("stitch.bg") }}</span>
        <div class="seg">
          <button :class="{ on: bg === 'white' }" @click="bg = 'white'">{{ t("stitch.bgWhite") }}</button>
          <button :class="{ on: bg === 'black' }" @click="bg = 'black'">{{ t("stitch.bgBlack") }}</button>
          <button :class="{ on: bg === 'transparent' }" @click="bg = 'transparent'">
            {{ t("stitch.bgTransparent") }}
          </button>
        </div>
      </div>

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
        <Icon v-else name="Combine" />
        {{ busy ? t("common.processing") : t("bench.run") }}
        <KbdCombo v-if="!busy" combo="mod+enter" />
      </button>
      <p v-if="!busy && files.length < 2" class="hint">{{ t("stitch.needTwo") }}</p>
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
