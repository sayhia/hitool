<script setup lang="ts">
/**
 * Re-renders each page through pdfjs, boosts contrast and sharpness, then
 * rebuilds a PDF with pdf-lib. Runs in the webview because that is where a
 * page rasteriser already lives; progress is reported per page.
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
import {
  outputDir,
  readFileBytes,
  writeFileChunked,
  baseName,
  pickDirectory,
} from "../../lib/backend";
import { PDF_EXT } from "../../lib/tools";
import { addOutput, finishJob, setProgress, startJob, type Job } from "../../stores/jobs";
import * as StoreService from "@bindings/hitool/services/storeservice";
import type { FileInfo } from "@bindings/hitool/services/models";

const files = ref<FileInfo[]>([]);
const level = ref<"light" | "medium" | "strong">("medium");
const outDir = ref("");
const busy = ref(false);
const job = ref<Job>();
const cancelled = ref(false);

const canRun = computed(() => files.value.length > 0 && !busy.value);

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    run();
  } else if (e.key === "Escape" && busy.value) {
    cancelled.value = true;
  }
}

onMounted(async () => {
  outDir.value = await outputDir("PDF");
});

useWindowKeydown(onKey);

/** Percentile contrast stretch followed by an unsharp mask. */
function enhance(data: Uint8ClampedArray, w: number, h: number, lvl: string) {
  const stretch = lvl === "light" ? 0.06 : lvl === "medium" ? 0.12 : 0.2;
  const amount = lvl === "light" ? 0.35 : lvl === "medium" ? 0.6 : 0.95;

  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    hist[((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000) | 0]++;
  }
  const total = w * h;
  let lo = 0;
  let hi = 255;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= total * stretch * 0.5) {
      lo = i;
      break;
    }
  }
  acc = 0;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i];
    if (acc >= total * stretch * 0.5) {
      hi = i;
      break;
    }
  }
  if (hi <= lo + 8) {
    lo = 0;
    hi = 255;
  }
  const scale = 255 / (hi - lo);
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.max(0, Math.min(255, (i - lo) * scale));
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }

  const src = new Uint8ClampedArray(data);
  const at = (x: number, y: number) => (y * w + x) * 4;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        const i = at(x, y) + c;
        const blur =
          (src[at(x - 1, y - 1) + c] +
            src[at(x, y - 1) + c] +
            src[at(x + 1, y - 1) + c] +
            src[at(x - 1, y) + c] +
            src[i] +
            src[at(x + 1, y) + c] +
            src[at(x - 1, y + 1) + c] +
            src[at(x, y + 1) + c] +
            src[at(x + 1, y + 1) + c]) / 9;
        data[i] = Math.max(0, Math.min(255, src[i] + (src[i] - blur) * amount));
      }
    }
  }
}

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  cancelled.value = false;
  const input = files.value[0];
  const j = startJob({
    tool: "pdf-enhance",
    label: `${t("tools.pdf-enhance.name")} · ${input.name}`,
    total: 1,
    outputDir: outDir.value,
  });
  job.value = j;

  try {
    const bytes = await readFileBytes(input.path);
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = (
      await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
    ).default;

    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const { PDFDocument } = await import("pdf-lib");
    const out = await PDFDocument.create();

    for (let n = 1; n <= doc.numPages; n++) {
      if (cancelled.value) {
        finishJob(j, "cancelled");
        return;
      }
      setProgress(j, n - 1, doc.numPages, t("pdf.enhance.rendering", { n, total: doc.numPages }));

      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      await page.render({ canvasContext: ctx, canvas, viewport } as any).promise;

      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      enhance(img.data, canvas.width, canvas.height, level.value);
      ctx.putImageData(img, 0, 0);

      const blob: Blob = await new Promise((res) =>
        canvas.toBlob((b) => res(b!), "image/jpeg", 0.88),
      );
      const embedded = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const pdfPage = out.addPage([viewport.width / 2, viewport.height / 2]);
      pdfPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: viewport.width / 2,
        height: viewport.height / 2,
      });
      page.cleanup();
    }

    setProgress(j, doc.numPages, doc.numPages, t("pdf.enhance.building"));
    const outBytes = await out.save();
    const outPath = `${outDir.value}/${baseName(input.path).replace(/\.pdf$/i, "")}_enhanced.pdf`;
    await writeFileChunked(outPath, outBytes);
    await StoreService.AddHistory("pdf-enhance", baseName(outPath)).catch(() => {});

    addOutput(j, {
      path: outPath,
      name: baseName(outPath),
      detail: t("pdf.enhance.pagesDone", { n: doc.numPages }),
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
  <WorkBench tool-id="pdf-enhance" :files="files">
    <template #source>
      <SourceTray
        v-model="files"
        :accept="PDF_EXT"
        filter-name="PDF"
        :multiple="false"
        :disabled="busy"
      />
    </template>

    <template #settings>
      <div class="field">
        <span class="lab">{{ t("pdf.enhance.level") }}</span>
        <div class="seg">
          <button :class="{ on: level === 'light' }" @click="level = 'light'">
            {{ t("pdf.enhance.levelLight") }}
          </button>
          <button :class="{ on: level === 'medium' }" @click="level = 'medium'">
            {{ t("pdf.enhance.levelMedium") }}
          </button>
          <button :class="{ on: level === 'strong' }" @click="level = 'strong'">
            {{ t("pdf.enhance.levelStrong") }}
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
        <Icon v-else name="Play" />
        {{ busy ? t("common.processing") : t("bench.run") }}
        <KbdCombo v-if="!busy" combo="mod+enter" />
      </button>
      <button v-if="busy" class="btn btn-sm btn-danger" @click="cancelled = true">
        {{ t("common.cancel") }} <kbd>ESC</kbd>
      </button>
      <p v-else-if="!files.length" class="hint">{{ t("bench.needFile") }}</p>
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
