<script setup lang="ts">
/**
 * QR codes, both directions. Encoding and decoding both run in Go rather than
 * in the webview: a payload is often a Wi-Fi password or an API token, and the
 * point of a local toolbox is that such a string never reaches a network.
 *
 * Decoding uses gozxing rather than the browser's BarcodeDetector — that API
 * does not exist in WebKit, so it would work nowhere on macOS.
 */
import { computed, onMounted, ref, watch } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import SourceTray from "../../work/SourceTray.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { errText } from "../../lib/err";
import { copyText, toast } from "../../stores/toast";
import { outputDir, pickFiles, revealFile } from "../../lib/backend";
import { IMAGE_EXT } from "../../lib/tools";
import * as QRService from "@bindings/hitool/services/qrservice";
import type { FileInfo, QRDecoded } from "@bindings/hitool/services/models";

type Mode = "encode" | "decode";

const mode = ref<Mode>("encode");

// --- encode ---
const text = ref("");
const size = ref(512);
const level = ref("medium");
const fg = ref("#111318");
const bg = ref("#ffffff");
const logoPath = ref("");
const preview = ref("");
const encodeError = ref("");
const saving = ref(false);

// --- decode ---
const files = ref<FileInfo[]>([]);
const decoded = ref<QRDecoded[]>([]);
const scanning = ref(false);

/**
 * Presets for the formats that have a syntax people get wrong from memory.
 * Each returns a payload skeleton the user fills in.
 */
const PRESETS = [
  { id: "url", icon: "Link", value: "https://" },
  { id: "wifi", icon: "Wifi", value: "WIFI:T:WPA;S:<SSID>;P:<password>;;" },
  { id: "mailto", icon: "Mail", value: "mailto:name@example.com?subject=&body=" },
  { id: "tel", icon: "Phone", value: "tel:+8613800000000" },
  { id: "sms", icon: "MessageSquare", value: "SMSTO:+8613800000000:" },
  {
    id: "vcard",
    icon: "Contact",
    value: "BEGIN:VCARD\nVERSION:3.0\nN:姓;名\nORG:公司\nTEL:+86\nEMAIL:\nEND:VCARD",
  },
];

/**
 * A QR holds at most ~2953 bytes, and less at higher recovery levels. Warning
 * before the encode fails is friendlier than a raw library error afterwards.
 */
const CAPACITY: Record<string, number> = {
  low: 2953,
  medium: 2331,
  high: 1663,
  highest: 1273,
};

const byteLength = computed(() => new TextEncoder().encode(text.value).length);
const capacity = computed(() => CAPACITY[level.value] ?? 2331);
const overCapacity = computed(() => byteLength.value > capacity.value);

let debounce = 0;
watch([text, size, level, fg, bg, logoPath], () => {
  clearTimeout(debounce);
  debounce = window.setTimeout(encode, 180);
});

onMounted(() => {
  if (text.value) encode();
});

async function encode() {
  encodeError.value = "";
  if (!text.value.trim()) {
    preview.value = "";
    return;
  }
  try {
    const res = await QRService.Encode(
      text.value,
      size.value,
      level.value,
      fg.value,
      bg.value,
      logoPath.value,
    );
    if (!res) return;
    if (res.error) {
      encodeError.value = res.error;
      preview.value = "";
      return;
    }
    preview.value = res.dataUri;
  } catch (e) {
    encodeError.value = errText(e);
    preview.value = "";
  }
}

async function chooseLogo() {
  const paths = await pickFiles(
    t("qr.pickLogo"),
    "Images",
    IMAGE_EXT.map((e) => `*.${e}`),
    false,
  );
  if (paths.length) logoPath.value = paths[0];
}

async function save() {
  if (!preview.value || saving.value) return;
  saving.value = true;
  try {
    const dir = await outputDir("QRCode");
    const res = await QRService.EncodeToFile(
      text.value,
      dir,
      size.value,
      level.value,
      fg.value,
      bg.value,
      logoPath.value,
    );
    if (res?.success) {
      toast(t("qr.saved"), "ok");
      await revealFile(res.outputPath);
    } else {
      toast(res?.error || t("common.failed"), "fail");
    }
  } catch (e) {
    toast(errText(e), "fail");
  } finally {
    saving.value = false;
  }
}

async function scan() {
  if (!files.value.length || scanning.value) return;
  scanning.value = true;
  decoded.value = [];
  try {
    decoded.value = (await QRService.Decode(files.value.map((f) => f.path))) ?? [];
    const bad = decoded.value.filter((d) => d.error).length;
    if (bad) toast(t("qr.someFailed", { n: bad }), "fail");
  } catch (e) {
    toast(errText(e), "fail");
  } finally {
    scanning.value = false;
  }
}

/** A decoded payload is often a link — worth calling out as one. */
function isLink(s: string) {
  return /^https?:\/\//i.test(s.trim());
}
</script>

<template>
  <ToolFrame tool-id="qr-code" :shape="mode === 'decode' ? 'batch' : 'flow'">
    <template v-if="mode === 'decode'" #source>
      <SourceTray
        v-model="files"
        :accept="IMAGE_EXT"
        filter-name="Images"
        :multiple="true"
        :disabled="scanning"
      />
    </template>

    <div class="seg modeseg">
      <button :class="{ on: mode === 'encode' }" @click="mode = 'encode'">
        {{ t("qr.modeEncode") }}
      </button>
      <button :class="{ on: mode === 'decode' }" @click="mode = 'decode'">
        {{ t("qr.modeDecode") }}
      </button>
    </div>

    <template v-if="mode === 'encode'">
      <div class="field grow-field">
        <div class="head">
          <span class="lab">{{ t("qr.content") }}</span>
          <span class="badge" :class="{ fail: overCapacity }">
            {{ byteLength }} / {{ capacity }} B
          </span>
          <button class="btn btn-sm btn-quiet" :disabled="!text" @click="text = ''">
            {{ t("common.clear") }}
          </button>
        </div>
        <textarea
          v-model="text"
          class="textarea mono src"
          :placeholder="t('qr.contentPh')"
          spellcheck="false"
        ></textarea>
        <p v-if="overCapacity" class="hint bad">{{ t("qr.tooLong") }}</p>
      </div>

      <div class="field">
        <span class="lab">{{ t("qr.size") }} · {{ size }}px</span>
        <input v-model.number="size" type="range" min="128" max="2048" step="64" class="slider" />
      </div>
    </template>

    <template v-else>
      <p class="hint">{{ t("qr.decodeHint") }}</p>
    </template>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ mode === "encode" ? t("qr.preview") : t("qr.decoded") }}</span>
        <span v-if="mode === 'decode' && decoded.length" class="badge acc">{{ decoded.length }}</span>
        <button
          v-if="mode === 'encode' && preview"
          class="btn btn-sm btn-quiet"
          :disabled="saving"
          @click="save"
        >
          <Icon name="Download" /> {{ t("qr.save") }}
        </button>
      </div>

      <div class="res-body scroll-y" :class="{ centre: mode === 'encode' }">
        <template v-if="mode === 'encode'">
          <p v-if="encodeError" class="banner fail">{{ encodeError }}</p>
          <!-- The plate is always white-ish so a light-coloured code stays
               visible when the app is in dark mode. -->
          <div v-else-if="preview" class="plate">
            <img :src="preview" :alt="t('qr.preview')" />
          </div>
          <p v-else class="hint">{{ t("qr.idle") }}</p>
        </template>

        <template v-else>
          <div v-for="d in decoded" :key="d.path" class="card">
            <div class="card-head">
              <span class="fname truncate" :title="d.path">{{ d.name }}</span>
              <span v-if="d.format" class="badge acc">{{ d.format }}</span>
            </div>
            <p v-if="d.error" class="banner fail">{{ d.error }}</p>
            <template v-else>
              <button class="payload" :title="t('common.copy')" @click="copyText(d.text, t('common.copied'))">
                <code class="mono">{{ d.text }}</code>
                <Icon name="Copy" />
              </button>
              <a v-if="isLink(d.text)" class="hint link" :href="d.text" target="_blank" rel="noreferrer">
                <Icon name="ExternalLink" /> {{ t("qr.openLink") }}
              </a>
            </template>
          </div>
          <p v-if="!decoded.length" class="hint pad">{{ t("qr.decodeIdle") }}</p>
        </template>
      </div>
    </template>

    <template #inspector>
      <template v-if="mode === 'encode'">
        <InspectorSection :title="t('qr.presets')" icon="Sparkles">
          <div class="optlist">
            <button v-for="p in PRESETS" :key="p.id" class="opt" @click="text = p.value">
              <Icon :name="p.icon" />
              {{ t(`qr.preset.${p.id}`) }}
            </button>
          </div>
        </InspectorSection>

        <InspectorSection :title="t('qr.ecLevel')" icon="ShieldCheck">
          <div class="optlist">
            <button
              v-for="l in ['low', 'medium', 'high', 'highest']"
              :key="l"
              class="opt"
              :class="{ on: level === l }"
              @click="level = l"
            >
              <Icon :name="level === l ? 'CircleCheck' : 'Circle'" />
              {{ t(`qr.ec.${l}`) }}
            </button>
          </div>
          <p class="hint">{{ t("qr.levelHint") }}</p>
        </InspectorSection>

        <InspectorSection :title="t('qr.style')" icon="Palette">
          <div class="colours">
            <label class="colour">
              <input v-model="fg" type="color" />
              <span class="lab">{{ t("qr.fg") }}</span>
            </label>
            <label class="colour">
              <input v-model="bg" type="color" />
              <span class="lab">{{ t("qr.bg") }}</span>
            </label>
          </div>
          <p class="hint">{{ t("qr.contrastHint") }}</p>
        </InspectorSection>

        <InspectorSection :title="t('qr.logo')" icon="Image">
          <div class="logorow">
            <button class="btn btn-sm btn-quiet grow" @click="chooseLogo">
              <Icon name="FolderOpen" />
              <span class="truncate">{{ logoPath ? logoPath.split("/").pop() : t("qr.pickLogo") }}</span>
            </button>
            <button v-if="logoPath" class="btn btn-sm btn-quiet btn-icon" @click="logoPath = ''">
              <Icon name="X" />
            </button>
          </div>
          <p class="hint">{{ t("qr.logoHint") }}</p>
        </InspectorSection>
      </template>

      <InspectorSection v-else :title="t('qr.about')" icon="Info">
        <p class="hint">{{ t("qr.aboutText") }}</p>
      </InspectorSection>
    </template>

    <template v-if="mode === 'decode'" #run>
      <button class="btn btn-signal" :disabled="!files.length || scanning" @click="scan">
        <Icon v-if="scanning" name="LoaderCircle" class="spin" />
        <Icon v-else name="ScanLine" />
        {{ scanning ? t("common.processing") : t("qr.scan") }}
      </button>
      <p v-if="!files.length" class="hint">{{ t("bench.needFile") }}</p>
    </template>
  </ToolFrame>
</template>

<style scoped>
.modeseg {
  width: 220px;
}

.head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.head .btn {
  margin-left: auto;
}

.grow-field {
  flex: 1;
  min-height: 0;
}

.src {
  flex: 1;
  min-height: 200px;
}

.slider {
  width: 100%;
  accent-color: var(--acc);
}

.hint.bad {
  color: var(--fail);
}

.res-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.res-head .btn {
  margin-left: auto;
}

.res-body {
  flex: 1;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.res-body.centre {
  align-items: center;
  justify-content: center;
}

.pad {
  padding: 4px;
}

/* The code sits on its own light plate: a dark-mode surface behind a dark
   foreground colour would make it unscannable on screen. */
.plate {
  padding: 16px;
  border-radius: var(--r-lg);
  background: #fff;
  box-shadow: var(--sh-2);
}

.plate img {
  display: block;
  width: min(340px, 46vw);
  height: auto;
  image-rendering: pixelated;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line-2);
}

.card:last-child {
  border-bottom: 0;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fname {
  font-size: var(--t-sm);
  font-weight: 600;
  min-width: 0;
}

.payload {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-1);
  cursor: pointer;
  text-align: left;
}

.payload:hover {
  border-color: var(--acc-line);
  background: var(--acc-wash);
}

.payload code {
  flex: 1;
  min-width: 0;
  font-size: var(--t-sm);
  color: var(--ink);
  word-break: break-all;
  white-space: pre-wrap;
  user-select: text;
}

.payload :deep(svg) {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--ink-3);
  opacity: 0;
}

.payload:hover :deep(svg) {
  opacity: 1;
}

.link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--acc);
  text-decoration: none;
}

.link :deep(svg) {
  width: 11px;
  height: 11px;
}

.optlist {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.opt {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 32px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  font-family: var(--f-ui);
  font-size: var(--t-sm);
  cursor: pointer;
  text-align: left;
}

.opt:hover:not(.on) {
  background: var(--s-3);
  color: var(--ink);
}

.opt.on {
  background: var(--acc-wash);
  border-color: var(--acc-line);
  color: var(--acc);
}

.opt :deep(svg) {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.colours {
  display: flex;
  gap: 10px;
}

.colour {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  cursor: pointer;
}

.colour input[type="color"] {
  width: 100%;
  height: 34px;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--s-1);
  cursor: pointer;
}

.logorow {
  display: flex;
  gap: 5px;
}

.grow {
  flex: 1;
  min-width: 0;
}
</style>
