<script setup lang="ts">
/** Median-cut quantisation over a downsampled canvas — no backend involved. */
import { onMounted, ref, watch } from "vue";
import WorkBench from "../../work/WorkBench.vue";
import SourceTray from "../../work/SourceTray.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { fileToBlobURL } from "../../lib/backend";
import { IMAGE_EXT } from "../../lib/tools";
import type { FileInfo } from "@bindings/hitool/services/models";

const files = ref<FileInfo[]>([]);
const preview = ref("");
const count = ref(6);
const palette = ref<string[]>([]);
const copied = ref("");
const busy = ref(false);

watch(files, async (v) => {
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = "";
  palette.value = [];
  if (!v.length) return;
  preview.value = await fileToBlobURL(v[0].path, "image/*");
  await extract();
});

async function extract() {
  if (!preview.value || busy.value) return;
  busy.value = true;
  try {
    const img = new Image();
    img.src = preview.value;
    await img.decode();
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 220 / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const px: number[][] = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      px.push([data[i], data[i + 1], data[i + 2]]);
    }

    let boxes: number[][][] = [px];
    while (boxes.length < count.value) {
      let bi = 0;
      let bc = 0;
      let br = -1;
      for (let b = 0; b < boxes.length; b++) {
        if (boxes[b].length < 2) continue;
        for (let c = 0; c < 3; c++) {
          let mn = 255;
          let mx = 0;
          for (const p of boxes[b]) {
            if (p[c] < mn) mn = p[c];
            if (p[c] > mx) mx = p[c];
          }
          if (mx - mn > br) {
            br = mx - mn;
            bi = b;
            bc = c;
          }
        }
      }
      if (br <= 0) break;
      const box = boxes[bi];
      box.sort((a, b) => a[bc] - b[bc]);
      const mid = box.length >> 1;
      boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
    }

    palette.value = boxes
      .filter((b) => b.length)
      .map((b) => {
        let r = 0;
        let g = 0;
        let bl = 0;
        for (const p of b) {
          r += p[0];
          g += p[1];
          bl += p[2];
        }
        const hex = (v: number) => Math.round(v / b.length).toString(16).padStart(2, "0");
        return `#${hex(r)}${hex(g)}${hex(bl)}`.toUpperCase();
      });
  } finally {
    busy.value = false;
  }
}

async function copy(c: string) {
  await navigator.clipboard.writeText(c);
  copied.value = c;
  setTimeout(() => (copied.value = ""), 1200);
}

async function copyAll() {
  await navigator.clipboard.writeText(palette.value.join("\n"));
  copied.value = "all";
  setTimeout(() => (copied.value = ""), 1200);
}
</script>

<template>
  <WorkBench tool-id="color-extractor" :files="files">
    <template #source>
      <SourceTray v-model="files" :accept="IMAGE_EXT" filter-name="Images" :multiple="false" />
      <img v-if="preview" :src="preview" alt="" class="preview" />
    </template>

    <template #settings>
      <div class="field">
        <span class="lab">{{ t("image.color.count") }}</span>
        <div class="seg">
          <button
            v-for="n in [4, 6, 8, 12]"
            :key="n"
            :class="{ on: count === n }"
            @click="count = n; extract()"
          >
            {{ n }}
          </button>
        </div>
      </div>
      <p class="hint">{{ t("image.color.clickCopy") }}</p>
    </template>

    <template #run>
      <button class="btn btn-signal run" :disabled="!preview || busy" @click="extract">
        <Icon v-if="busy" name="LoaderCircle" class="spin" />
        <Icon v-else name="Palette" />
        {{ t("image.color.action") }}
      </button>
    </template>

    <template #output>
      <div v-if="!palette.length" class="idle">
        <Icon name="Palette" />
        <p class="hint">{{ t("bench.outputIdle") }}</p>
      </div>

      <template v-else>
        <button v-for="c in palette" :key="c" class="swatch" @click="copy(c)">
          <span class="chipcolor" :style="{ background: c }" />
          <span class="mono hex">{{ c }}</span>
          <span v-if="copied === c" class="lab ok">{{ t("common.copied") }}</span>
          <Icon v-else name="Copy" class="cp" />
        </button>

        <button class="btn btn-sm" @click="copyAll">
          <Icon name="Copy" />
          {{ copied === "all" ? t("common.copied") : t("common.copy") }}
        </button>
      </template>
    </template>
  </WorkBench>
</template>

<style scoped>
.run {
  min-width: 168px;
}

.preview {
  width: 100%;
  max-height: 190px;
  object-fit: contain;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-2);
}

.idle {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--ink-3);
  padding: 24px 12px;
  text-align: center;
}

.idle :deep(svg) {
  width: 22px;
  height: 22px;
  opacity: 0.55;
}

.swatch {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 5px 7px 5px 5px;
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  background: var(--s-2);
  cursor: pointer;
  color: var(--ink);
  font-family: var(--f-ui);
}

.swatch:hover {
  border-color: var(--ink-3);
}

.swatch:hover .cp {
  opacity: 1;
}

.chipcolor {
  width: 34px;
  height: 22px;
  border-radius: 2px;
  border: 1px solid var(--line);
  flex-shrink: 0;
}

.hex {
  flex: 1;
  text-align: left;
  font-size: 12px;
}

.ok {
  color: var(--ok);
  text-transform: none;
}

.cp {
  width: 12px;
  height: 12px;
  opacity: 0;
  color: var(--ink-3);
  transition: opacity 0.12s;
}
</style>
