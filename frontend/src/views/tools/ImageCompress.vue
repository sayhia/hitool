<script setup lang="ts">
/**
 * Image compression with a live quality preview.
 *
 * The preview encodes the first selected image at four JPEG quality levels
 * on a canvas — real sizes, not guesses — so the trade-off is judged before
 * committing; clicking a level picks the matching backend quality bucket.
 * The run itself stays on the backend batch compressor.
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
import { outputDir, readFileBytes, formatBytes } from "../../lib/backend";
import { IMAGE_EXT } from "../../lib/tools";
import { addOutput, finishJob, startJob, type Job } from "../../stores/jobs";
import * as StoreService from "@bindings/hitool/services/storeservice";
import * as ImageService from "@bindings/hitool/services/imageservice";
import type { BatchResult, FileInfo } from "@bindings/hitool/services/models";

const PREVIEW_QS = [90, 75, 60, 45];

const files = ref<FileInfo[]>([]);
const quality = ref<"high" | "medium" | "low">("medium");
const outDir = ref("");
const busy = ref(false);
const job = ref<Job>();

const canRun = computed(() => files.value.length > 0 && !busy.value);

// ---- quality preview (first image, client-side) ----
const preview = ref<{ q: number; url: string; size: number; pct: number }[]>([]);
const previewBusy = ref(false);

function bucketFor(q: number): "high" | "medium" | "low" {
  if (q >= 90) return "high";
  if (q >= 75) return "medium";
  return "low";
}

watch(
  () => files.value[0]?.path,
  async (path) => {
    for (const p of preview.value) URL.revokeObjectURL(p.url);
    preview.value = [];
    if (!path || previewBusy.value) return;
    previewBusy.value = true;
    try {
      const bytes = await readFileBytes(path);
      const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();

      const original = bytes.byteLength;
      const out: { q: number; url: string; size: number; pct: number }[] = [];
      for (const q of PREVIEW_QS) {
        const blob: Blob = await new Promise((res) =>
          canvas.toBlob((b) => res(b!), "image/jpeg", q / 100),
        );
        out.push({
          q,
          url: URL.createObjectURL(blob),
          size: blob.size,
          pct: original > 0 ? Math.round((1 - blob.size / original) * 100) : 0,
        });
      }
      preview.value = out;
    } finally {
      previewBusy.value = false;
    }
  },
);

// ---- run: backend batch compress at the chosen bucket ----
function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    run();
  }
}

useWindowKeydown(onKey);

onMounted(async () => {
  outDir.value = await outputDir("Images");
});

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  const input = files.value;
  const j = startJob({
    tool: "image-compress",
    label: `${t("tools.image-compress.name")} · ${input[0].name}${input.length > 1 ? ` +${input.length - 1}` : ""}`,
    total: 1,
    outputDir: outDir.value,
  });
  job.value = j;

  try {
    const res: BatchResult | null = await ImageService.CompressBatch(
      input.map((f) => f.path),
      outDir.value,
      quality.value,
    );
    if (!res) throw new Error("no result");

    if (res.successCount > 0) {
      const before = res.originalSize ?? 0;
      const after = res.compressedSize ?? 0;
      const detail =
        before && after
          ? `${formatBytes(before)} → ${formatBytes(after)} · −${Math.round((1 - after / before) * 1000) / 10}%`
          : `${res.successCount}/${input.length}`;
      addOutput(j, {
        path: res.outputDir || outDir.value,
        name: t("bench.nFiles", { n: res.successCount }),
        detail,
        ok: true,
      });
    }
    if (res.failCount > 0) {
      for (const e of (res.errors ?? []).slice(0, 3)) {
        addOutput(j, { path: "", name: e, detail: "", ok: false });
      }
    }
    await StoreService.AddHistory("image-compress", input[0].name).catch(() => {});
    finishJob(j, res.failCount > 0 && res.successCount === 0 ? "failed" : "done");
  } catch (e) {
    finishJob(j, "failed", errText(e));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <WorkBench tool-id="image-compress" :files="files">
    <template #source>
      <SourceTray v-model="files" :accept="IMAGE_EXT" filter-name="Images" :disabled="busy" />
    </template>

    <template #settings>
      <div class="field">
        <span class="lab">{{ t("image.quality") }}</span>
        <div class="seg">
          <button :class="{ on: quality === 'high' }" @click="quality = 'high'">
            {{ t("image.qualityHigh") }}
          </button>
          <button :class="{ on: quality === 'medium' }" @click="quality = 'medium'">
            {{ t("image.qualityMedium") }}
          </button>
          <button :class="{ on: quality === 'low' }" @click="quality = 'low'">
            {{ t("image.qualityLow") }}
          </button>
        </div>
      </div>

      <div class="field">
        <span class="lab">{{ t("bench.outputDir") }}</span>
        <span class="dir-path mono truncate" :title="outDir">{{ outDir || "—" }}</span>
      </div>
    </template>

    <template #run>
      <button class="btn btn-signal run" :disabled="!canRun" @click="run">
        <Icon v-if="busy" name="LoaderCircle" class="spin" />
        <Icon v-else name="Shrink" />
        {{ busy ? t("common.processing") : t("common.start") }}
        <KbdCombo v-if="!busy" combo="mod+enter" />
      </button>
      <p v-if="!busy && !files.length" class="hint">{{ t("bench.needFile") }}</p>
    </template>

    <template #output>
      <div class="res-head">
        <span class="lab">{{ t("cmp.preview") }}</span>
        <span v-if="previewBusy" class="badge">
          <Icon name="LoaderCircle" class="spin" />
        </span>
      </div>

      <div v-if="preview.length" class="cmpgrid scroll-y">
        <button
          v-for="p in preview"
          :key="p.q"
          class="cmpcard"
          :class="{ on: quality === bucketFor(p.q) }"
          :title="t('cmp.previewHint')"
          @click="quality = bucketFor(p.q)"
        >
          <img :src="p.url" alt="" class="cmpimg" />
          <span class="cmpq mono">q{{ p.q }}</span>
          <span class="cmpsize mono">{{ formatBytes(p.size) }}</span>
          <span class="badge ok">−{{ p.pct }}%</span>
        </button>
      </div>
      <p v-else class="hint pad">{{ t("cmp.previewIdle") }}</p>

      <OutputList :job="job" />
    </template>
  </WorkBench>
</template>

<style scoped>
.run {
  min-width: 168px;
}

.res-head {
  padding: 10px 14px;
}

.cmpgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  padding: 12px 14px;
}

.cmpcard {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-1);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.16s var(--ease), box-shadow 0.16s var(--ease);
}

.cmpcard:hover {
  border-color: var(--cat-line);
}

.cmpcard.on {
  border-color: var(--cat);
  box-shadow: 0 0 0 1px var(--cat-line);
}

.cmpimg {
  width: 100%;
  height: 92px;
  object-fit: cover;
  border-radius: var(--r-sm);
  background: var(--s-sunken);
}

.cmpq {
  font-size: var(--t-xs);
  font-weight: 700;
  color: var(--cat);
}

.cmpsize {
  font-size: var(--t-xs);
  color: var(--ink-2);
}

.pad {
  padding: 10px 14px;
}
</style>
