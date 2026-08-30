<script setup lang="ts">
/**
 * Slices one image into a cols×rows grid — the classic 3×3 social post —
 * writing each tile as its own PNG, numbered left-to-right, top-to-bottom.
 */
import { computed, onMounted, ref } from "vue";
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
import { gridRects } from "../../lib/gridSplit";
import { addOutput, finishJob, setProgress, startJob, type Job } from "../../stores/jobs";
import * as StoreService from "@bindings/hitool/services/storeservice";
import type { FileInfo } from "@bindings/hitool/services/models";

const GRIDS = [
  { id: "2x2", cols: 2, rows: 2 },
  { id: "3x3", cols: 3, rows: 3 },
  { id: "2x3", cols: 2, rows: 3 },
  { id: "3x2", cols: 3, rows: 2 },
  { id: "4x4", cols: 4, rows: 4 },
];

const files = ref<FileInfo[]>([]);
const grid = ref("3x3");
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

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  const input = files.value[0];
  const g = GRIDS.find((g) => g.id === grid.value) ?? GRIDS[1];
  const total = g.cols * g.rows;
  const j = startJob({
    tool: "image-grid",
    label: `${t("tools.image-grid.name")} · ${input.name}`,
    total,
    outputDir: outDir.value,
  });
  job.value = j;

  try {
    const bytes = await readFileBytes(input.path);
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
    const rects = gridRects(bitmap.width, bitmap.height, g.cols, g.rows);
    const stem = baseName(input.path).replace(/\.[a-z0-9]+$/i, "");

    for (let i = 0; i < rects.length; i++) {
      setProgress(j, i, total, t("grid.tile", { n: i + 1, total }));
      const r = rects[i];
      const canvas = document.createElement("canvas");
      canvas.width = r.w;
      canvas.height = r.h;
      canvas.getContext("2d")!.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
      const outPath = `${outDir.value}/${stem}_${i + 1}.png`;
      await writeFileChunked(outPath, new Uint8Array(await blob.arrayBuffer()));
      addOutput(j, { path: outPath, name: baseName(outPath), detail: `${r.w}×${r.h}px`, ok: true });
    }
    bitmap.close();

    await StoreService.AddHistory("image-grid", stem).catch(() => {});
    setProgress(j, total, total);
    addOutput(j, {
      path: outDir.value,
      name: t("grid.summary", { n: total }),
      detail: "",
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
  <WorkBench tool-id="image-grid" :files="files">
    <template #source>
      <SourceTray v-model="files" :accept="IMAGE_EXT" filter-name="Images" :multiple="false" :disabled="busy" />
    </template>

    <template #settings>
      <div class="field">
        <span class="lab">{{ t("grid.layout") }}</span>
        <div class="seg">
          <button v-for="g in GRIDS" :key="g.id" :class="{ on: grid === g.id }" @click="grid = g.id">
            {{ g.id }}
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
        <Icon v-else name="Grid3x3" />
        {{ busy ? t("common.processing") : t("grid.run") }}
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
