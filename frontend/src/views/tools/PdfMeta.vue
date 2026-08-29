<script setup lang="ts">
/**
 * Reads a PDF's info dictionary with pdf-lib and shows it, then offers to
 * strip every field back out. Useful before sharing documents that quietly
 * carry author names and editor fingerprints.
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
import { PDF_EXT } from "../../lib/tools";
import { addOutput, finishJob, setProgress, startJob, type Job } from "../../stores/jobs";
import * as StoreService from "@bindings/hitool/services/storeservice";
import type { FileInfo } from "@bindings/hitool/services/models";

interface MetaRow {
  key: string;
  value: string;
}

const files = ref<FileInfo[]>([]);
const rows = ref<MetaRow[]>([]);
const reading = ref(false);
const readError = ref("");
const outDir = ref("");
const busy = ref(false);
const job = ref<Job>();

const hasMeta = computed(() => rows.value.some((r) => r.value.trim() !== ""));
const canRun = computed(() => files.value.length > 0 && !busy.value && hasMeta.value);

const FIELD_LABELS: Record<string, string> = {
  title: "pdf.meta.title",
  author: "pdf.meta.author",
  subject: "pdf.meta.subject",
  keywords: "pdf.meta.keywords",
  creator: "pdf.meta.creator",
  producer: "pdf.meta.producer",
  created: "pdf.meta.created",
  modified: "pdf.meta.modified",
};

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    run();
  }
}

onMounted(async () => {
  outDir.value = await outputDir("PDF");
  window.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

function fmtDate(d: Date | undefined): string {
  if (!d || isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

async function inspect() {
  rows.value = [];
  readError.value = "";
  if (!files.value.length) return;
  reading.value = true;
  try {
    const bytes = await readFileBytes(files.value[0].path);
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    rows.value = (
      [
        ["title", doc.getTitle() ?? ""],
        ["author", doc.getAuthor() ?? ""],
        ["subject", doc.getSubject() ?? ""],
        ["keywords", doc.getKeywords() ?? ""],
        ["creator", doc.getCreator() ?? ""],
        ["producer", doc.getProducer() ?? ""],
        ["created", fmtDate(doc.getCreationDate())],
        ["modified", fmtDate(doc.getModificationDate())],
      ] as [string, string][]
    ).map(([key, value]) => ({ key, value }));
  } catch (e) {
    readError.value = errText(e);
  } finally {
    reading.value = false;
  }
}

watch(files, inspect);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  const input = files.value[0];
  const j = startJob({
    tool: "pdf-meta",
    label: `${t("tools.pdf-meta.name")} · ${input.name}`,
    total: 1,
    outputDir: outDir.value,
  });
  job.value = j;

  try {
    setProgress(j, 0, 1, t("pdf.meta.cleaning"));
    const bytes = await readFileBytes(input.path);
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    doc.setTitle("");
    doc.setAuthor("");
    doc.setSubject("");
    doc.setKeywords([]);
    doc.setCreator("");
    doc.setProducer("");
    doc.setCreationDate(new Date(0));
    doc.setModificationDate(new Date(0));

    const outBytes = await doc.save();
    const outPath = `${outDir.value}/${baseName(input.path).replace(/\.pdf$/i, "")}_clean.pdf`;
    await writeFileChunked(outPath, outBytes);
    await StoreService.AddHistory("pdf-meta", baseName(outPath)).catch(() => {});

    setProgress(j, 1, 1);
    addOutput(j, {
      path: outPath,
      name: baseName(outPath),
      detail: t("pdf.meta.cleaned"),
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
  <WorkBench tool-id="pdf-meta" :files="files">
    <template #source>
      <SourceTray v-model="files" :accept="PDF_EXT" filter-name="PDF" :multiple="false" :disabled="busy" />
    </template>

    <template #settings>
      <div class="meta-box">
        <template v-if="reading">
          <p class="hint"><Icon name="LoaderCircle" class="spin inline" /> {{ t("common.processing") }}</p>
        </template>
        <template v-else-if="readError">
          <p class="hint fail">{{ readError }}</p>
        </template>
        <template v-else-if="rows.length">
          <div v-for="row in rows" :key="row.key" class="meta-row">
            <span class="meta-key">{{ t(FIELD_LABELS[row.key]) }}</span>
            <span class="meta-val mono truncate" :title="row.value">{{ row.value || "—" }}</span>
          </div>
          <p v-if="!hasMeta" class="hint">{{ t("pdf.meta.emptyHint") }}</p>
        </template>
        <p v-else class="hint">{{ t("pdf.meta.pick") }}</p>
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
        {{ busy ? t("common.processing") : t("pdf.meta.run") }}
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
  grid-template-columns: 72px 1fr;
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

.inline {
  display: inline-block;
  vertical-align: -2px;
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
