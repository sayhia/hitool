<script setup lang="ts">
/**
 * Encodes one image at four JPEG quality steps and writes them all out,
 * so the size/quality trade-off is judged from real files instead of a
 * guess. Each output row carries its size and the saving against the
 * original.
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
import { outputDir, readFileBytes, writeFileChunked, baseName, pickDirectory, formatBytes } from "../../lib/backend";
import { IMAGE_EXT } from "../../lib/tools";
import { addOutput, finishJob, setProgress, startJob, type Job } from "../../stores/jobs";
import * as StoreService from "@bindings/hitool/services/storeservice";
import type { FileInfo } from "@bindings/hitool/services/models";

const QUALITIES = [90, 75, 60, 45];

const files = ref<FileInfo[]>([]);
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
  const j = startJob({
    tool: "image-compare",
    label: `${t("tools.image-compare.name")} · ${input.name}`,
    total: QUALITIES.length,
    outputDir: outDir.value,
  });
  job.value = j;

  try {
    const bytes = await readFileBytes(input.path);
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();

    const stem = baseName(input.path).replace(/\.[a-z0-9]+$/i, "");
    const original = bytes.byteLength;

    for (let i = 0; i < QUALITIES.length; i++) {
      const q = QUALITIES[i];
      setProgress(j, i, QUALITIES.length, t("cmp.encoding", { q }));
      const blob: Blob = await new Promise((res) =>
        canvas.toBlob((b) => res(b!), "image/jpeg", q / 100),
      );
      const outBytes = new Uint8Array(await blob.arrayBuffer());
      const outPath = `${outDir.value}/${stem}_q${q}.jpg`;
      await writeFileChunked(outPath, outBytes);
      const pct = original > 0 ? Math.round((1 - outBytes.byteLength / original) * 100) : 0;
      addOutput(j, {
        path: outPath,
        name: baseName(outPath),
        detail: t("cmp.detail", { size: formatBytes(outBytes.byteLength), pct }),
        ok: true,
      });
    }

    await StoreService.AddHistory("image-compare", stem).catch(() => {});
    setProgress(j, QUALITIES.length, QUALITIES.length);
    addOutput(j, {
      path: input.path,
      name: t("cmp.original"),
      detail: formatBytes(original),
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
  <WorkBench tool-id="image-compare" :files="files">
    <template #source>
      <SourceTray v-model="files" :accept="IMAGE_EXT" filter-name="Images" :multiple="false" :disabled="busy" />
    </template>

    <template #settings>
      <p class="hint">{{ t("cmp.hint", { list: QUALITIES.join(" / ") }) }}</p>

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
        <Icon v-else name="Scale" />
        {{ busy ? t("common.processing") : t("cmp.run") }}
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
