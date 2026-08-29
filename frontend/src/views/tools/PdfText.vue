<script setup lang="ts">
/**
 * Pulls the text layer out of a PDF with pdfjs and writes it to a .txt,
 * page-separated. Scanned pages have no text layer; the tool says so rather
 * than handing back a blank file with no explanation.
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
import { PDF_EXT } from "../../lib/tools";
import { addOutput, finishJob, setProgress, startJob, type Job } from "../../stores/jobs";
import * as StoreService from "@bindings/hitool/services/storeservice";
import type { FileInfo } from "@bindings/hitool/services/models";

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
  outDir.value = await outputDir("Text");
  window.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  const input = files.value[0];
  const j = startJob({
    tool: "pdf-text",
    label: `${t("tools.pdf-text.name")} · ${input.name}`,
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

    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      setProgress(j, n - 1, doc.numPages, t("pdf.text.page", { n, total: doc.numPages }));
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      // Items arrive in reading order; a space between them reconstructs the
      // line well enough for extraction purposes.
      pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
      page.cleanup();
    }
    await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();

    const text = pages.join("\n\n").trim();
    setProgress(j, doc.numPages, doc.numPages, t("pdf.text.building"));
    const outPath = `${outDir.value}/${baseName(input.path).replace(/\.pdf$/i, "")}.txt`;
    await writeFileChunked(outPath, new TextEncoder().encode(text));
    await StoreService.AddHistory("pdf-text", baseName(outPath)).catch(() => {});

    const chars = [...text].length;
    addOutput(j, {
      path: outPath,
      name: baseName(outPath),
      detail:
        chars > 0
          ? t("pdf.text.done", { n: chars })
          : t("pdf.text.empty"),
      ok: chars > 0,
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
  <WorkBench tool-id="pdf-text" :files="files">
    <template #source>
      <SourceTray v-model="files" :accept="PDF_EXT" filter-name="PDF" :multiple="false" :disabled="busy" />
    </template>

    <template #settings>
      <div class="field">
        <span class="lab">{{ t("bench.outputDir") }}</span>
        <div class="dir">
          <span class="dir-path mono truncate" :title="outDir">{{ outDir || "—" }}</span>
          <button class="btn btn-sm btn-quiet" @click="browse">{{ t("bench.change") }}</button>
        </div>
      </div>
      <p class="hint">{{ t("pdf.text.hint") }}</p>
    </template>

    <template #run>
      <button class="btn btn-signal run" :disabled="!canRun" @click="run">
        <Icon v-if="busy" name="LoaderCircle" class="spin" />
        <Icon v-else name="Play" />
        {{ busy ? t("common.processing") : t("bench.run") }}
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
