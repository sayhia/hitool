<script setup lang="ts">
/**
 * Shows what a photo is quietly carrying — camera, timestamps, GPS — with
 * the small in-house EXIF reader, then re-encodes through a canvas so the
 * clean copy holds nothing but pixels.
 */
import { computed, onMounted, ref, watch } from "vue";
import { useWindowKeydown } from "../../lib/useWindowKeydown";
import WorkBench from "../../work/WorkBench.vue";
import SourceTray from "../../work/SourceTray.vue";
import OutputList from "../../work/OutputList.vue";
import Icon from "../../components/Icon.vue";
import KbdCombo from "../../components/KbdCombo.vue";
import { t } from "../../lib/i18n";
import { errText } from "../../lib/err";
import { outputDir, readFileBytes, writeFileChunked, baseName, pickDirectory } from "../../lib/backend";
import { IMAGE_EXT } from "../../lib/tools";
import { readExif, type ExifData } from "../../lib/exif";
import { addOutput, finishJob, setProgress, startJob, type Job } from "../../stores/jobs";
import * as StoreService from "@bindings/hitool/services/storeservice";
import type { FileInfo } from "@bindings/hitool/services/models";

const LABELS: Record<string, string> = {
  Make: "exif.make",
  Model: "exif.model",
  Orientation: "exif.orientation",
  Software: "exif.software",
  DateTime: "exif.dateTime",
  DateTimeOriginal: "exif.dateTimeOriginal",
  ExposureTime: "exif.exposureTime",
  FNumber: "exif.fNumber",
  ISO: "exif.iso",
  FocalLength: "exif.focalLength",
  Width: "exif.width",
  Height: "exif.height",
  LensModel: "exif.lensModel",
  GPSLatitude: "exif.gpsLat",
  GPSLongitude: "exif.gpsLng",
};

const files = ref<FileInfo[]>([]);
const rows = ref<{ key: string; value: string }[]>([]);
const readError = ref("");
const outDir = ref("");
const busy = ref(false);
const job = ref<Job>();

const canRun = computed(() => files.value.length > 0 && !busy.value);

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    run();
  }
}

onMounted(async () => {
  outDir.value = await outputDir("Images");
});

useWindowKeydown(onKey);

async function inspect() {
  rows.value = [];
  readError.value = "";
  if (!files.value.length) return;
  try {
    const bytes = await readFileBytes(files.value[0].path);
    const data: ExifData = readExif(bytes);
    rows.value = Object.entries(data).map(([key, value]) => ({ key, value: String(value) }));
  } catch (e) {
    readError.value = errText(e);
  }
}

watch(files, inspect);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  const input = files.value[0];
  const j = startJob({
    tool: "image-exif",
    label: `${t("tools.image-exif.name")} · ${input.name}`,
    total: 1,
    outputDir: outDir.value,
  });
  job.value = j;

  try {
    setProgress(j, 0, 1, t("exif.cleaning"));
    const bytes = await readFileBytes(input.path);
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();

    // Re-encoding keeps pixels only; every metadata chunk is left behind.
    const isPng = /\.png$/i.test(input.path);
    const blob: Blob = await new Promise((res) =>
      canvas.toBlob((b) => res(b!), isPng ? "image/png" : "image/jpeg", 0.92),
    );
    const ext = isPng ? "png" : "jpg";
    const outPath = `${outDir.value}/${baseName(input.path).replace(/\.[a-z0-9]+$/i, "")}_clean.${ext}`;
    await writeFileChunked(outPath, new Uint8Array(await blob.arrayBuffer()));
    await StoreService.AddHistory("image-exif", baseName(outPath)).catch(() => {});

    setProgress(j, 1, 1);
    addOutput(j, {
      path: outPath,
      name: baseName(outPath),
      detail: t("exif.cleaned"),
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
  <WorkBench tool-id="image-exif" :files="files">
    <template #source>
      <SourceTray v-model="files" :accept="IMAGE_EXT" filter-name="Images" :multiple="false" :disabled="busy" />
    </template>

    <template #settings>
      <div class="meta-box">
        <p v-if="readError" class="hint fail">{{ readError }}</p>
        <template v-else-if="rows.length">
          <div v-for="row in rows" :key="row.key" class="meta-row">
            <span class="meta-key">{{ LABELS[row.key] ? t(LABELS[row.key]) : row.key }}</span>
            <span class="meta-val mono truncate" :title="row.value">{{ row.value }}</span>
          </div>
        </template>
        <p v-else-if="files.length" class="hint">{{ t("exif.none") }}</p>
        <p v-else class="hint">{{ t("exif.pick") }}</p>
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
        <Icon v-else name="Eraser" />
        {{ busy ? t("common.processing") : t("exif.run") }}
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

.meta-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-2);
}

.meta-row {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 10px;
  align-items: baseline;
  font-size: var(--t-sm);
}

.meta-key {
  color: var(--ink-3);
}

.meta-val {
  min-width: 0;
  color: var(--ink-1);
}

.fail {
  color: var(--fail);
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
