<script setup lang="ts">
/**
 * Colour conversion, contrast checking and ramps.
 *
 * The contrast panel is the reason this is a tool rather than a converter:
 * WCAG is defined on linearised luminance, and eyeballing two swatches is
 * exactly how a "looks fine to me" grey ends up failing AA.
 */
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { PALETTE_FORMATS, toPalette, type PaletteFormat, type Swatch } from "../../lib/palette";
import {
  contrastRatio,
  harmonies,
  parseColor,
  ramp,
  rgbToCmyk,
  rgbToHsl,
  rgbToHsv,
  toHex,
  toHslString,
  toRgbString,
  wcagLevel,
  type RGB,
} from "../../lib/color";
import { fileToBlobURL, pickFiles } from "../../lib/backend";
import { IMAGE_EXT } from "../../lib/tools";

const input = ref("#3376fb");
const against = ref("#ffffff");
const largeText = ref(false);

const SWATCHES = [
  "#3376fb", "#17855c", "#cf3f45", "#b0761a", "#0f766e",
  "#7c3aed", "#db2777", "#0284c7", "#1f2937", "#f5f5f4",
];

const color = computed(() => parseColor(input.value));
const other = computed(() => parseColor(against.value));

const forms = computed(() => {
  const c = color.value;
  if (!c) return [];
  const hsl = rgbToHsl(c);
  const hsv = rgbToHsv(c);
  const cmyk = rgbToCmyk(c);
  return [
    { label: "HEX", value: toHex(c, true) },
    { label: "RGB", value: toRgbString(c) },
    { label: "HSL", value: toHslString(c) },
    { label: "HSV", value: `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)` },
    { label: "CMYK", value: `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)` },
    { label: "CSS", value: `--color: ${toHex(c)};` },
    { label: "H S L", value: `${hsl.h}° ${hsl.s}% ${hsl.l}%` },
  ];
});

const ratio = computed(() =>
  color.value && other.value ? contrastRatio(color.value, other.value) : null,
);
const level = computed(() => (ratio.value === null ? null : wcagLevel(ratio.value, largeText.value)));

const steps = computed(() => (color.value ? ramp(color.value, 9) : []));
const mates = computed(() => (color.value ? harmonies(color.value) : []));

const css = (c: RGB) => toHex(c);

/**
 * The ramp and the harmonies as one palette. Exporting the ramp alone would
 * be the common case, but the harmonies are the part you cannot re-derive
 * from a single hex, so they travel with it.
 */
const swatches = computed<Swatch[]>(() => {
  if (!color.value) return [];
  const scale = steps.value.map((c, i) => ({ name: `${(i + 1) * 100}`, rgb: c }));
  return [...scale, ...mates.value.map((m) => ({ name: m.name, rgb: m.rgb }))];
});

const paletteFormat = ref<PaletteFormat>("css");
const paletteText = computed(() => toPalette(swatches.value, paletteFormat.value));

function use(hex: string) {
  input.value = hex;
}

function swap() {
  const a = input.value;
  input.value = against.value;
  against.value = a;
}

// ---------- extract from image ----------
// Median-cut quantisation over a downsampled canvas — no backend involved.
// A clicked swatch becomes the inspected colour; the old standalone tool
// only copied, and "inspect it" is the reason you extracted it.
const imgPreview = ref("");
const exCount = ref(6);
const exPalette = ref<string[]>([]);
const exBusy = ref(false);

async function pickImage() {
  const paths = await pickFiles(t("common.selectFile"), "Images", IMAGE_EXT.map((e) => `*.${e}`), false);
  if (!paths.length) return;
  if (imgPreview.value) URL.revokeObjectURL(imgPreview.value);
  imgPreview.value = "";
  exPalette.value = [];
  imgPreview.value = await fileToBlobURL(paths[0], "image/*");
  await extract();
}

async function extract() {
  if (!imgPreview.value || exBusy.value) return;
  exBusy.value = true;
  try {
    const img = new Image();
    img.src = imgPreview.value;
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
    while (boxes.length < exCount.value) {
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

    exPalette.value = boxes
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
    exBusy.value = false;
  }
}
</script>

<template>
  <ToolFrame tool-id="color-tool" shape="flow">
    <div class="row">
      <div class="field grow">
        <span class="lab">{{ t("color.input") }}</span>
        <div class="withchip">
          <span class="chipcolor" :style="{ background: color ? css(color) : 'transparent' }" />
          <input
            v-model="input"
            class="input mono"
            :class="{ bad: !color && !!input.trim() }"
            :placeholder="t('color.inputPh')"
            spellcheck="false"
          />
          <input
            v-if="color"
            type="color"
            class="picker"
            :value="toHex(color)"
            @input="use(($event.target as HTMLInputElement).value)"
          />
        </div>
        <p v-if="!color && input.trim()" class="err">{{ t("color.bad") }}</p>
      </div>

      <div class="field grow">
        <span class="lab">{{ t("color.against") }}</span>
        <div class="withchip">
          <span class="chipcolor" :style="{ background: other ? css(other) : 'transparent' }" />
          <input v-model="against" class="input mono" :class="{ bad: !other }" spellcheck="false" />
        </div>
      </div>

      <button class="btn btn-sm swapbtn" :title="t('color.swap')" @click="swap">
        <Icon name="ArrowLeftRight" />
      </button>
    </div>

    <div class="field">
      <span class="lab">{{ t("color.presets") }}</span>
      <div class="swatches">
        <button
          v-for="s in SWATCHES"
          :key="s"
          class="swatch"
          :style="{ background: s }"
          :title="s"
          @click="use(s)"
        />
      </div>
    </div>

    <div v-if="color" class="field">
      <span class="lab">{{ t("color.ramp") }}</span>
      <div class="rampbar">
        <button
          v-for="(c, i) in steps"
          :key="i"
          class="step"
          :style="{ background: css(c) }"
          :title="toHex(c)"
          @click="copyText(toHex(c), t('common.copied'))"
        >
          <span class="steptag mono">{{ toHex(c).slice(1) }}</span>
        </button>
      </div>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("color.result") }}</span>
        <span v-if="level" class="badge" :class="level === 'fail' ? 'fail' : 'ok'">
          {{ level === "fail" ? t("color.fail") : level }}
        </span>
        <span v-if="ratio !== null" class="badge">{{ ratio }}:1</span>
      </div>

      <div class="res scroll-y">
        <div v-if="color && other" class="preview" :style="{ background: css(other), color: css(color) }">
          <span class="big" :class="{ large: largeText }">{{ t("color.sample") }}</span>
          <span class="small">{{ t("color.sampleSmall") }}</span>
        </div>

        <div v-if="ratio !== null" class="bars">
          <div v-for="b in [{ k: 'AA', need: largeText ? 3 : 4.5 }, { k: 'AAA', need: largeText ? 4.5 : 7 }]" :key="b.k" class="bar">
            <span class="lab">{{ b.k }}</span>
            <span class="track"><span class="fill" :style="{ width: Math.min(100, (ratio / b.need) * 100) + '%' }" /></span>
            <span class="mono need">{{ b.need }}:1</span>
            <Icon :name="ratio >= b.need ? 'Check' : 'X'" :class="ratio >= b.need ? 'pass' : 'no'" />
          </div>
        </div>

        <div v-if="forms.length" class="forms">
          <button
            v-for="f in forms"
            :key="f.label"
            class="form"
            :title="t('common.copy')"
            @click="copyText(f.value, t('common.copied'))"
          >
            <span class="lab">{{ f.label }}</span>
            <code class="mono">{{ f.value }}</code>
            <Icon name="Copy" />
          </button>
        </div>

        <p v-if="!color" class="hint pad">{{ t("color.idle") }}</p>
      </div>
    </template>

    <template #inspector>
      <InspectorSection :title="t('color.extract')" icon="FileImage">
        <button class="btn btn-sm" :disabled="exBusy" @click="pickImage">
          <Icon name="FileImage" /> {{ t("image.color.action") }}
        </button>
        <div class="exseg">
          <button
            v-for="n in [4, 6, 8, 12]"
            :key="n"
            class="chip"
            :class="{ on: exCount === n }"
            @click="exCount = n; extract()"
          >
            {{ n }}
          </button>
        </div>
        <img v-if="imgPreview" :src="imgPreview" alt="" class="exprev" />
        <div v-if="exPalette.length" class="exgrid">
          <button
            v-for="c in exPalette"
            :key="c"
            class="exsw"
            :style="{ background: c }"
            :title="`${c} · ${t('color.input')}`"
            @click="use(c)"
          >
            <span class="exhex mono">{{ c }}</span>
          </button>
        </div>
        <p v-if="exPalette.length" class="hint">{{ t("color.extractHint") }}</p>
      </InspectorSection>

      <InspectorSection :title="t('color.wcag')" icon="Contrast">
        <button class="chip" :class="{ on: largeText }" @click="largeText = !largeText">
          {{ t("color.largeText") }}
        </button>
        <p class="hint">{{ t("color.largeHint") }}</p>
      </InspectorSection>

      <InspectorSection v-if="swatches.length" :title="t('color.export')" icon="Download">
        <div class="chips">
          <button
            v-for="f in PALETTE_FORMATS"
            :key="f"
            class="chip"
            :class="{ on: paletteFormat === f }"
            @click="paletteFormat = f"
          >
            {{ t(`color.p_${f}`) }}
          </button>
        </div>
        <button class="btn btn-sm exportbtn" @click="copyText(paletteText, t('common.copied'))">
          <Icon name="Copy" /> {{ t("color.copyPalette") }}
        </button>
        <pre class="palprev mono scroll-y">{{ paletteText }}</pre>
      </InspectorSection>

      <InspectorSection v-if="mates.length" :title="t('color.harmony')" icon="Palette">
        <div class="mates">
          <button
            v-for="m in mates"
            :key="m.name"
            class="mate"
            @click="use(toHex(m.rgb))"
          >
            <span class="mateswatch" :style="{ background: css(m.rgb) }" />
            <span class="lab">{{ t(`color.${m.name}`) }}</span>
            <code class="mono">{{ toHex(m.rgb) }}</code>
          </button>
        </div>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
/* ---- extract from image ---- */
.exseg {
  display: flex;
  gap: 4px;
}

.exprev {
  width: 100%;
  max-height: 120px;
  object-fit: contain;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--s-2);
}

.exgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 5px;
}

.exsw {
  height: 44px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  cursor: pointer;
  display: flex;
  align-items: flex-end;
  padding: 2px 3px;
  transition: transform 0.14s var(--ease-out);
}

.exsw:hover {
  transform: translateY(-1px);
  box-shadow: var(--e-1);
}

.exhex {
  font-size: 8.5px;
  padding: 0 3px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.78);
  color: #161b27;
  user-select: text;
}

.row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.grow {
  flex: 1;
  min-width: 180px;
}

.withchip {
  display: flex;
  align-items: center;
  gap: 8px;
}
.picker {
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: transparent;
  cursor: pointer;
}

.chipcolor {
  width: 30px;
  height: 30px;
  border-radius: var(--r-sm);
  border: 1px solid var(--line);
  flex-shrink: 0;
  /* Chequerboard, so a transparent colour reads as transparent. */
  background-image: linear-gradient(45deg, var(--s-3) 25%, transparent 25%),
    linear-gradient(-45deg, var(--s-3) 25%, transparent 25%);
  background-size: 8px 8px;
}

.withchip .input {
  flex: 1;
  min-width: 0;
}

.input.bad {
  border-color: var(--fail);
}

.err {
  font-size: var(--t-xs);
  color: var(--fail);
  margin-top: 4px;
}

.swapbtn {
  margin-bottom: 1px;
}

.swatches {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.swatch {
  width: 26px;
  height: 26px;
  border-radius: var(--r-sm);
  border: 1px solid var(--line);
  cursor: pointer;
  padding: 0;
}

.rampbar {
  display: flex;
  border-radius: var(--r);
  overflow: hidden;
  border: 1px solid var(--line);
}

.step {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  height: 46px;
  border: 0;
  cursor: pointer;
  padding: 0;
  display: grid;
  place-items: end center;
}

.steptag {
  font-size: 8px;
  color: rgb(255 255 255 / 0.75);
  mix-blend-mode: difference;
  padding-bottom: 3px;
  letter-spacing: 0.02em;
}

.res-head {
  padding: 11px 14px;
}

.res {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pad {
  padding: 4px 0;
}

.preview {
  border-radius: var(--r);
  border: 1px solid var(--line);
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.big {
  font-size: 15px;
  font-weight: 600;
}

.big.large {
  font-size: 24px;
}

.small {
  font-size: 12px;
  opacity: 0.9;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--t-xs);
}

.track {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: var(--s-3);
  overflow: hidden;
}

.fill {
  display: block;
  height: 100%;
  background: var(--acc);
}

.need {
  color: var(--ink-3);
  min-width: 44px;
  text-align: right;
}

.bar :deep(svg) {
  width: 13px;
  height: 13px;
}

.pass {
  color: var(--ok);
}

.no {
  color: var(--fail);
}

.forms {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.form {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: var(--f-ui);
}

.form:hover {
  background: var(--s-2);
}

.form .lab {
  min-width: 46px;
  flex-shrink: 0;
}

.form code {
  flex: 1;
  min-width: 0;
  font-size: var(--t-sm);
  color: var(--ink);
  user-select: text;
  word-break: break-all;
}

.form :deep(svg) {
  width: 12px;
  height: 12px;
  color: var(--ink-4);
  flex-shrink: 0;
}

.mates {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mate {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.mate:hover {
  background: var(--s-3);
}

.mateswatch {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid var(--line);
  flex-shrink: 0;
}

.mate code {
  margin-left: auto;
  font-size: var(--t-xs);
  color: var(--ink-3);
}

.exportbtn {
  margin-top: 7px;
  width: 100%;
}

.palprev {
  margin: 7px 0 0;
  padding: 8px 9px;
  max-height: 150px;
  border-radius: var(--r-sm);
  background: var(--s-2);
  font-size: 10.5px;
  line-height: 1.6;
  white-space: pre;
  overflow: auto;
  color: var(--ink-2);
  user-select: text;
}
</style>
