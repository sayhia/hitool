<script setup lang="ts">
/**
 * Stamps page numbers or a text watermark onto every page with pdf-lib.
 * Stamping draws on top of the original content — no re-rendering, so the
 * document keeps its vector text. Latin type only: the built-in PDF base
 * fonts have no CJK glyphs.
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
const mode = ref<"numbers" | "watermark">("numbers");
const pos = ref<"bottom-center" | "bottom-right">("bottom-center");
const withTotal = ref(true);
const watermarkText = ref("CONFIDENTIAL");
const opacity = ref(0.18);
const diagonal = ref(true);
const outDir = ref("");
const busy = ref(false);
const job = ref<Job>();

const canRun = computed(
  () => files.value.length > 0 && !busy.value && (mode.value === "numbers" || !!watermarkText.value.trim()),
);

/** Base fonts are Latin-only; warn instead of emitting tofu. */
const cjkWarning = computed(() => /[^\x00-\xff]/.test(watermarkText.value));

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

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  const input = files.value[0];
  const j = startJob({
    tool: "pdf-stamp",
    label: `${t("tools.pdf-stamp.name")} · ${input.name}`,
    total: 1,
    outputDir: outDir.value,
  });
  job.value = j;

  try {
    const bytes = await readFileBytes(input.path);
    const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();

    pages.forEach((page, i) => {
      setProgress(j, i, pages.length, t("pdf.stamp.page", { n: i + 1, total: pages.length }));
      const { width, height } = page.getSize();
      if (mode.value === "numbers") {
        const text = withTotal.value
          ? `${i + 1} / ${pages.length}`
          : `${i + 1}`;
        const size = 10;
        const tw = font.widthOfTextAtSize(text, size);
        const x = pos.value === "bottom-center" ? (width - tw) / 2 : width - tw - 36;
        page.drawText(text, { x, y: 22, size, font, color: rgb(0.35, 0.35, 0.38) });
      } else {
        const text = watermarkText.value.trim();
        const size = Math.max(24, Math.min(64, width / Math.max(6, text.length)));
        const tw = font.widthOfTextAtSize(text, size);
        page.drawText(text, {
          x: (width - tw) / 2,
          y: height / 2,
          size,
          font,
          color: rgb(0.55, 0.55, 0.58),
          opacity: opacity.value,
          rotate: diagonal.value ? degrees(45) : degrees(0),
        });
      }
    });

    setProgress(j, pages.length, pages.length, t("pdf.stamp.building"));
    const outBytes = await doc.save();
    const suffix = mode.value === "numbers" ? "_numbered" : "_watermarked";
    const outPath = `${outDir.value}/${baseName(input.path).replace(/\.pdf$/i, "")}${suffix}.pdf`;
    await writeFileChunked(outPath, outBytes);
    await StoreService.AddHistory("pdf-stamp", baseName(outPath)).catch(() => {});

    addOutput(j, {
      path: outPath,
      name: baseName(outPath),
      detail: t("pdf.stamp.pagesDone", { n: pages.length }),
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
  <WorkBench tool-id="pdf-stamp" :files="files">
    <template #source>
      <SourceTray v-model="files" :accept="PDF_EXT" filter-name="PDF" :multiple="false" :disabled="busy" />
    </template>

    <template #settings>
      <div class="field">
        <span class="lab">{{ t("pdf.stamp.mode") }}</span>
        <div class="seg">
          <button :class="{ on: mode === 'numbers' }" @click="mode = 'numbers'">
            {{ t("pdf.stamp.modeNumbers") }}
          </button>
          <button :class="{ on: mode === 'watermark' }" @click="mode = 'watermark'">
            {{ t("pdf.stamp.modeWatermark") }}
          </button>
        </div>
      </div>

      <template v-if="mode === 'numbers'">
        <div class="field">
          <span class="lab">{{ t("pdf.stamp.position") }}</span>
          <div class="seg">
            <button :class="{ on: pos === 'bottom-center' }" @click="pos = 'bottom-center'">
              {{ t("pdf.stamp.posCenter") }}
            </button>
            <button :class="{ on: pos === 'bottom-right' }" @click="pos = 'bottom-right'">
              {{ t("pdf.stamp.posRight") }}
            </button>
          </div>
        </div>
        <label class="check">
          <input v-model="withTotal" type="checkbox" />
          <span>{{ t("pdf.stamp.withTotal") }}</span>
        </label>
      </template>

      <template v-else>
        <div class="field">
          <span class="lab">{{ t("pdf.stamp.waterText") }}</span>
          <input v-model="watermarkText" class="input" spellcheck="false" :placeholder="t('pdf.stamp.waterPh')" />
          <p v-if="cjkWarning" class="hint warn">{{ t("pdf.stamp.latinOnly") }}</p>
        </div>
        <div class="field">
          <span class="lab">{{ t("pdf.stamp.opacity") }} · {{ Math.round(opacity * 100) }}%</span>
          <input v-model="opacity" type="range" min="0.05" max="0.6" step="0.01" />
        </div>
        <label class="check">
          <input v-model="diagonal" type="checkbox" />
          <span>{{ t("pdf.stamp.diagonal") }}</span>
        </label>
      </template>

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

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--t-sm);
  color: var(--ink-2);
  cursor: pointer;
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
