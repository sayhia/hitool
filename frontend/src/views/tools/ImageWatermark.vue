<script setup lang="ts">
/**
 * Stamps a watermark onto a batch of images.
 *
 * A text mark is rasterised here, in a canvas, rather than in Go: drawing CJK
 * text server-side would mean bundling a font with the binary, and the webview
 * already has every font the system does. Go receives a PNG either way, so it
 * only ever has to composite.
 */
import { computed, onMounted, ref, watch } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import SourceTray from "../../work/SourceTray.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { errText } from "../../lib/err";
import { toast } from "../../stores/toast";
import { outputDir, openFolder, pickFiles, formatBytes } from "../../lib/backend";
import { IMAGE_EXT } from "../../lib/tools";
import { addOutput, finishJob, startJob, type Job } from "../../stores/jobs";
import * as ImageService from "@bindings/hitool/services/imageservice";
import type { FileInfo } from "@bindings/hitool/services/models";

const ANCHORS = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];

const files = ref<FileInfo[]>([]);
const source = ref<"text" | "image">("text");

// text mark
const text = ref("© HiTool");
const font = ref("system-ui");
const weight = ref(700);
const colour = ref("#ffffff");
const shadow = ref(true);
const rotate = ref(0);

// image mark
const markPath = ref("");
const markDataUri = ref("");

// placement
const anchor = ref("br");
const tile = ref(false);
const scale = ref(25);
const opacity = ref(60);
const margin = ref(3);
const quality = ref(92);

const busy = ref(false);
const job = ref<Job>();

const FONTS = ["system-ui", "Georgia, serif", "Menlo, monospace", "Impact, sans-serif"];

/** The PNG that gets sent to Go — either the rendered text or the chosen file. */
const markPNG = ref("");

watch([text, font, weight, colour, shadow, rotate, source], () => {
  if (source.value === "text") markPNG.value = renderText();
});
watch(markDataUri, () => {
  if (source.value === "image") markPNG.value = markDataUri.value;
});
watch(source, () => {
  markPNG.value = source.value === "text" ? renderText() : markDataUri.value;
});

onMounted(() => {
  markPNG.value = renderText();
});

/**
 * Renders the text to a transparent PNG at a fixed 4× so the mark still has
 * pixels to spare after Go scales it to a fraction of the target image.
 */
function renderText(): string {
  const body = text.value || " ";
  const px = 96;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = `${weight.value} ${px}px ${font.value}`;
  const lines = body.split("\n");
  const w = Math.max(...lines.map((l) => probe.measureText(l).width));
  const h = px * 1.25 * lines.length;

  const rad = (rotate.value * Math.PI) / 180;
  // Bounding box of the rotated rectangle, so a tilted mark isn't clipped.
  const cw = Math.ceil(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))) + 24;
  const ch = Math.ceil(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad))) + 24;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, cw);
  canvas.height = Math.max(1, ch);
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.font = `${weight.value} ${px}px ${font.value}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (shadow.value) {
    // A light mark on a light photo is otherwise invisible; the shadow
    // guarantees an edge without needing a second colour picker.
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = px / 8;
    ctx.shadowOffsetY = px / 24;
  }
  ctx.fillStyle = colour.value;
  lines.forEach((l, i) => {
    ctx.fillText(l, 0, (i - (lines.length - 1) / 2) * px * 1.25);
  });
  return canvas.toDataURL("image/png");
}

async function chooseMark() {
  const paths = await pickFiles(
    t("wm.pickMark"),
    "PNG",
    ["*.png"],
    false,
  );
  if (!paths.length) return;
  markPath.value = paths[0];
  try {
    // []byte crosses the bridge as base64 already, which is exactly the shape
    // WatermarkBatch wants — no decode/re-encode round trip needed.
    const { ReadFileBytes } = await import("@bindings/hitool/services/systemservice");
    markDataUri.value = `data:image/png;base64,${(await ReadFileBytes(paths[0])) ?? ""}`;
  } catch (e) {
    toast(errText(e), "fail");
  }
}

const ready = computed(() => files.value.length > 0 && !!markPNG.value);

// Progress arrives via the app-wide bridge in stores/jobs — a second
// subscription here would double-count and miss its in-flight adjustment.
async function run() {
  if (!ready.value || busy.value) return;
  busy.value = true;
  const j = startJob({ tool: "image-watermark", label: t("wm.label", { n: files.value.length }), total: files.value.length });
  job.value = j;

  try {
    const dir = await outputDir("Watermark");
    const res = await ImageService.WatermarkBatch(
      files.value.map((f) => f.path),
      dir,
      markPNG.value,
      anchor.value,
      scale.value,
      opacity.value,
      margin.value,
      tile.value,
      quality.value,
    );
    if (!res) throw new Error(t("common.failed"));

    for (const f of files.value) {
      addOutput(j, { path: dir, name: f.name, detail: formatBytes(f.size), ok: true });
    }
    finishJob(j, res.failCount ? "failed" : "done", (res.errors ?? []).join("\n"));

    if (res.successCount) {
      toast(t("wm.done", { n: res.successCount }), "ok");
      await openFolder(dir);
    }
    if (res.failCount) toast(t("wm.someFailed", { n: res.failCount }), "fail");
  } catch (e) {
    finishJob(j, "failed", errText(e));
    toast(errText(e), "fail");
  } finally {
    busy.value = false;
  }
}

function cancel() {
  ImageService.Cancel();
}
</script>

<template>
  <ToolFrame tool-id="image-watermark" shape="batch">
    <template #source>
      <SourceTray
        v-model="files"
        :accept="IMAGE_EXT"
        filter-name="Images"
        :multiple="true"
        :disabled="busy"
      />
    </template>

    <div class="field">
      <span class="lab">{{ t("wm.source") }}</span>
      <div class="seg">
        <button :class="{ on: source === 'text' }" @click="source = 'text'">
          {{ t("wm.srcText") }}
        </button>
        <button :class="{ on: source === 'image' }" @click="source = 'image'">
          {{ t("wm.srcImage") }}
        </button>
      </div>
    </div>

    <div v-if="source === 'text'" class="field">
      <span class="lab">{{ t("wm.text") }}</span>
      <textarea v-model="text" class="textarea marktext" rows="2" spellcheck="false"></textarea>
      <p class="hint">{{ t("wm.textHint") }}</p>
    </div>

    <div v-else class="field">
      <span class="lab">{{ t("wm.markFile") }}</span>
      <div class="markrow">
        <button class="btn btn-quiet grow" @click="chooseMark">
          <Icon name="FolderOpen" />
          <span class="truncate">{{ markPath ? markPath.split("/").pop() : t("wm.pickMark") }}</span>
        </button>
        <button v-if="markPath" class="btn btn-quiet btn-icon" @click="markPath = ''; markDataUri = ''">
          <Icon name="X" />
        </button>
      </div>
      <p class="hint">{{ t("wm.markHint") }}</p>
    </div>

    <div class="field">
      <span class="lab">{{ t("wm.placement") }}</span>
      <!-- A nine-square grid says "corner" faster than a dropdown of nine
           two-letter codes ever could. -->
      <div class="grid9" :class="{ off: tile }">
        <button
          v-for="a in ANCHORS"
          :key="a"
          class="cell"
          :class="{ on: anchor === a && !tile }"
          :disabled="tile"
          :title="t(`wm.anchor.${a}`)"
          @click="anchor = a"
        >
          <span class="dot"></span>
        </button>
      </div>
      <label class="check">
        <input v-model="tile" type="checkbox" />
        {{ t("wm.tile") }}
      </label>
    </div>

    <div class="field">
      <span class="lab">{{ t("wm.scale") }} · {{ scale }}%</span>
      <input v-model.number="scale" type="range" min="5" max="100" class="slider" />
      <p class="hint">{{ t("wm.scaleHint") }}</p>
    </div>

    <div class="field">
      <span class="lab">{{ t("wm.opacity") }} · {{ opacity }}%</span>
      <input v-model.number="opacity" type="range" min="5" max="100" class="slider" />
    </div>

    <div v-if="!tile" class="field">
      <span class="lab">{{ t("wm.margin") }} · {{ margin }}%</span>
      <input v-model.number="margin" type="range" min="0" max="20" class="slider" />
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("wm.preview") }}</span>
        <span v-if="job?.outputs.length" class="badge acc">{{ job.outputs.length }}</span>
      </div>
      <div class="res-body scroll-y">
        <!-- What the mark itself looks like, on both a light and a dark
             backing — the two cases where a watermark disappears. -->
        <div v-if="markPNG" class="swatches">
          <div class="swatch light">
            <img :src="markPNG" :style="{ opacity: opacity / 100 }" :alt="t('wm.preview')" />
          </div>
          <div class="swatch dark">
            <img :src="markPNG" :style="{ opacity: opacity / 100 }" :alt="t('wm.preview')" />
          </div>
        </div>
        <p v-else class="hint pad">{{ t("wm.noMark") }}</p>

        <div v-if="busy && job" class="banner run">
          <Icon name="LoaderCircle" class="spin" />
          <span class="grow truncate">{{ job.activeFile || t("common.processing") }}</span>
          <span class="mono">{{ job.current }}/{{ job.total }}</span>
        </div>
        <p v-if="job?.error" class="banner fail">{{ job.error }}</p>
      </div>
    </template>

    <template #inspector>
      <InspectorSection v-if="source === 'text'" :title="t('wm.style')" icon="Type">
        <div class="field">
          <span class="lab">{{ t("wm.font") }}</span>
          <select v-model="font" class="input">
            <option v-for="f in FONTS" :key="f" :value="f">{{ f.split(",")[0] }}</option>
          </select>
        </div>
        <div class="field">
          <span class="lab">{{ t("wm.colour") }}</span>
          <input v-model="colour" type="color" class="colourin" />
        </div>
        <div class="field">
          <span class="lab">{{ t("wm.rotate") }} · {{ rotate }}°</span>
          <input v-model.number="rotate" type="range" min="-90" max="90" step="5" class="slider" />
        </div>
        <label class="check">
          <input v-model="shadow" type="checkbox" />
          {{ t("wm.shadow") }}
        </label>
        <label class="check">
          <input v-model="weight" type="checkbox" :true-value="700" :false-value="400" />
          {{ t("wm.bold") }}
        </label>
      </InspectorSection>

      <InspectorSection :title="t('wm.output')" icon="Settings2">
        <div class="field">
          <span class="lab">{{ t("resize.quality") }} · {{ quality }}</span>
          <input v-model.number="quality" type="range" min="50" max="100" class="slider" />
          <p class="hint">{{ t("wm.qualityHint") }}</p>
        </div>
      </InspectorSection>
    </template>

    <template #run>
      <button class="btn btn-signal" :disabled="!ready || busy" @click="run">
        <Icon v-if="busy" name="LoaderCircle" class="spin" />
        <Icon v-else name="Stamp" />
        {{ busy ? t("common.processing") : t("wm.run") }}
      </button>
      <button v-if="busy" class="btn btn-danger" @click="cancel">{{ t("common.cancel") }}</button>
      <p v-else-if="!files.length" class="hint">{{ t("bench.needFile") }}</p>
      <p v-else-if="!markPNG" class="hint">{{ t("wm.noMark") }}</p>
    </template>
  </ToolFrame>
</template>

<style scoped>
.slider {
  width: 100%;
  accent-color: var(--acc);
}

.marktext {
  min-height: 56px;
  resize: vertical;
}

.markrow {
  display: flex;
  gap: 5px;
}

.grow {
  flex: 1;
  min-width: 0;
}

.grid9 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  width: 108px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--s-2);
}

.grid9.off {
  opacity: 0.4;
}

.cell {
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 3px;
  background: var(--s-1);
  cursor: pointer;
}

.cell:hover:not(:disabled) {
  background: var(--s-3);
}

.cell:disabled {
  cursor: not-allowed;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ink-4, var(--ink-3));
}

.cell.on {
  background: var(--acc);
}

.cell.on .dot {
  background: #fff;
}

.check {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: var(--t-sm);
  color: var(--ink-2);
  cursor: pointer;
}

.check input {
  accent-color: var(--acc);
}

.colourin {
  width: 100%;
  height: 34px;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--s-1);
  cursor: pointer;
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
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pad {
  padding: 4px;
}

.swatches {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.swatch {
  display: grid;
  place-items: center;
  min-height: 120px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.swatch.light {
  background: #f2f3f5;
}

.swatch.dark {
  background: #26282e;
}

.swatch img {
  max-width: 100%;
  max-height: 92px;
  object-fit: contain;
}
</style>
