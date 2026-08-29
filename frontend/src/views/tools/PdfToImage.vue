<script setup lang="ts">
/**
 * Renders PDF pages to images. Rasterising needs a PDF renderer, and the
 * webview already ships one — pdf.js — so the pages are drawn here and only
 * the finished bytes cross to Go.
 */
import { computed, ref, watch } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import SourceTray from "../../work/SourceTray.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { errText } from "../../lib/err";
import { toast } from "../../stores/toast";
import { outputDir, readFileBytes, writeFileChunked, baseName, formatBytes } from "../../lib/backend";
import { addOutput, finishJob, setProgress, startJob, type Job } from "../../stores/jobs";
import type { FileInfo } from "@bindings/hitool/services/models";

const files = ref<FileInfo[]>([]);
const format = ref<"png" | "jpg">("png");
const scale = ref(2);
const quality = ref(90);
const pageSel = ref("");
const busy = ref(false);
const job = ref<Job>();
const pageCount = ref(0);

watch(files, async (v) => {
  pageCount.value = 0;
  if (!v.length) return;
  // Teardown belongs to the loading task, not the document — the document
  // proxy has no destroy(), and calling one throws into the catch below,
  // which is how the page count silently stayed at zero.
  let task: ReturnType<Awaited<ReturnType<typeof loadPdfjs>>["getDocument"]> | undefined;
  try {
    const pdfjs = await loadPdfjs();
    task = pdfjs.getDocument({ data: await readFileBytes(v[0].path) });
    pageCount.value = (await task.promise).numPages;
  } catch {
    pageCount.value = 0;
  } finally {
    await task?.destroy();
  }
});

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

/** "1-3,7" → [1,2,3,7]; empty means every page. */
function parsePages(sel: string, max: number): number[] {
  const s = sel.trim();
  if (!s) return Array.from({ length: max }, (_, i) => i + 1);
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(part.trim());
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])].sort((x, y) => x - y);
      for (let i = a; i <= b; i++) if (i >= 1 && i <= max) out.add(i);
    } else {
      const n = Number(part.trim());
      if (n >= 1 && n <= max) out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

const selectedCount = computed(() =>
  pageCount.value ? parsePages(pageSel.value, pageCount.value).length : 0,
);

const badSelection = computed(
  () => !!pageSel.value.trim() && pageCount.value > 0 && selectedCount.value === 0,
);

async function run() {
  if (!files.value.length || busy.value) return;
  busy.value = true;
  const input = files.value[0];
  const stem = baseName(input.path).replace(/\.pdf$/i, "");

  const j = startJob({ tool: "pdf-to-image", label: baseName(input.path), total: 1 });
  job.value = j;

  let task: ReturnType<Awaited<ReturnType<typeof loadPdfjs>>["getDocument"]> | undefined;
  try {
    const dir = await outputDir("Images");
    const pdfjs = await loadPdfjs();
    task = pdfjs.getDocument({ data: await readFileBytes(input.path) });
    const doc = await task.promise;
    const pages = parsePages(pageSel.value, doc.numPages);
    setProgress(j, 0, pages.length);

    const mime = format.value === "png" ? "image/png" : "image/jpeg";
    const ext = format.value === "png" ? "png" : "jpg";
    const pad = String(doc.numPages).length;

    for (let i = 0; i < pages.length; i++) {
      const n = pages[i];
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: scale.value });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d")!;
      // JPEG has no alpha; without this the page renders on black.
      if (format.value === "jpg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      await page.render({ canvasContext: ctx, canvas, viewport } as never).promise;

      const blob: Blob = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b!), mime, quality.value / 100),
      );
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const name = `${stem}_${String(n).padStart(pad, "0")}.${ext}`;
      await writeFileChunked(`${dir}/${name}`, bytes);

      addOutput(j, {
        path: `${dir}/${name}`,
        name,
        detail: `${canvas.width}×${canvas.height} · ${formatBytes(bytes.length)}`,
        ok: true,
      });
      setProgress(j, i + 1, pages.length, name);
      page.cleanup();
    }

    finishJob(j, "done");
    toast(t("pdf2img.done", { n: pages.length }), "ok");
  } catch (e) {
    finishJob(j, "failed", errText(e));
    toast(errText(e), "fail");
  } finally {
    await task?.destroy();
    busy.value = false;
  }
}

/** Roughly what one page will weigh, so a 6× scale doesn't surprise anyone. */
const estimate = computed(() => {
  if (!pageCount.value) return "";
  const px = Math.round(595 * scale.value) * Math.round(842 * scale.value);
  return `~${Math.round(px / 1_000_000)} MP / ${t("pdf2img.perPage")}`;
});
</script>

<template>
  <ToolFrame tool-id="pdf-to-image" shape="batch">
    <template #source>
      <SourceTray
        v-model="files"
        :accept="['pdf']"
        filter-name="PDF"
        :multiple="false"
        :disabled="busy"
      />
      <p v-if="pageCount" class="hint pages">{{ t("pdf2img.pages", { n: pageCount }) }}</p>
    </template>

    <div class="field">
      <span class="lab">{{ t("pdf2img.format") }}</span>
      <div class="seg">
        <button :class="{ on: format === 'png' }" @click="format = 'png'">PNG</button>
        <button :class="{ on: format === 'jpg' }" @click="format = 'jpg'">JPG</button>
      </div>
    </div>

    <div class="field">
      <span class="lab">{{ t("pdf2img.scale") }} · {{ scale }}×</span>
      <input v-model.number="scale" type="range" min="1" max="6" step="0.5" class="slider" />
      <p class="hint">{{ estimate || t("pdf2img.scaleHint") }}</p>
    </div>

    <div v-if="format === 'jpg'" class="field">
      <span class="lab">{{ t("resize.quality") }} · {{ quality }}</span>
      <input v-model.number="quality" type="range" min="40" max="100" class="slider" />
    </div>

    <div class="field">
      <span class="lab">{{ t("pdf2img.pageSel") }}</span>
      <input
        v-model="pageSel"
        class="input mono"
        :class="{ bad: badSelection }"
        :placeholder="t('pdf.split.rangeHint')"
      />
      <p class="hint">
        {{
          badSelection
            ? t("pdf2img.badRange")
            : selectedCount
              ? t("pdf2img.willExport", { n: selectedCount })
              : t("pdf2img.allPages")
        }}
      </p>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("bench.output") }}</span>
        <span v-if="job?.outputs.length" class="badge acc">{{ job.outputs.length }}</span>
      </div>
      <div class="res-body scroll-y">
        <div v-if="busy && job" class="banner run">
          <Icon name="LoaderCircle" class="spin" />
          <span class="grow truncate">{{ job.activeFile || t("common.processing") }}</span>
          <span class="mono">{{ job.current }}/{{ job.total }}</span>
        </div>
        <div v-for="o in job?.outputs ?? []" :key="o.path" class="outrow">
          <Icon name="Image" />
          <span class="grow truncate">{{ o.name }}</span>
          <span class="lab">{{ o.detail }}</span>
        </div>
        <p v-if="!job" class="hint pad">{{ t("bench.outputIdle") }}</p>
      </div>
    </template>

    <template #inspector>
      <InspectorSection :title="t('pdf2img.about')" icon="Info">
        <p class="hint">{{ t("pdf2img.aboutText") }}</p>
      </InspectorSection>
    </template>

    <template #run>
      <button class="btn btn-signal" :disabled="!files.length || busy || badSelection" @click="run">
        <Icon v-if="busy" name="LoaderCircle" class="spin" />
        <Icon v-else name="Images" />
        {{ busy ? t("common.processing") : t("pdf2img.run") }}
      </button>
      <p v-if="!files.length" class="hint">{{ t("bench.needFile") }}</p>
    </template>
  </ToolFrame>
</template>

<style scoped>
.pages {
  padding-top: 6px;
}

.slider {
  width: 100%;
  accent-color: var(--acc);
}

.input.bad {
  border-color: var(--fail);
}

.res-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.res-body {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pad {
  padding: 4px;
}

.grow {
  flex: 1;
  min-width: 0;
}

.outrow {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 11px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-1);
  font-size: var(--t-sm);
}

.outrow :deep(svg) {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--acc);
}
</style>
