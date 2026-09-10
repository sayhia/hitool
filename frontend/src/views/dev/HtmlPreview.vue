<script setup lang="ts">
import { ref, watch, computed } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { errText } from "../../lib/err";
import { toast } from "../../stores/toast";
import { pickFiles, readFileBytes, formatBytes, baseName } from "../../lib/backend";
import { onFilesDropped, useFileHandoff } from "../../lib/drop";
import { decodeText, MAX_TEXT_BYTES } from "../../lib/textfile";
import type { FileInfo } from "@bindings/hitool/services/models";

const SAMPLE = `<!doctype html>
<title>HiTool</title>
<style>
  body { font: 16px/1.5 system-ui; margin: 24px; }
  h1 { letter-spacing: -0.03em; }
</style>
<h1>Hello</h1>
<p>Paste HTML on the left. Scripts run in a sandbox.</p>
`;

const src = ref(SAMPLE);
const frame = ref(SAMPLE);
const autoRefresh = ref(true);
const darkPreview = ref(false);

type DevicePreset = { id: string; width: string; icon: string };
const DEVICES: DevicePreset[] = [
  { id: "full", width: "100%", icon: "Monitor" },
  { id: "tablet", width: "768px", icon: "Tablet" },
  { id: "mobile", width: "375px", icon: "Smartphone" },
];
const device = ref("full");
const deviceWidth = computed(() => DEVICES.find((d) => d.id === device.value)?.width ?? "100%");

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function run() {
  frame.value = src.value;
}

watch(src, () => {
  if (!autoRefresh.value) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { frame.value = src.value; }, 300);
});

const wrappedFrame = computed(() => {
  if (!darkPreview.value) return frame.value;
  return `<style>html{background:#1a1a1a;color:#e0e0e0;}</style>${frame.value}`;
});

async function load(f: FileInfo) {
  if (f.size > MAX_TEXT_BYTES) {
    toast(t("diff.tooBig", { name: f.name, max: formatBytes(MAX_TEXT_BYTES) }), "fail");
    return;
  }
  try {
    const d = decodeText(await readFileBytes(f.path));
    if (d.binary) {
      toast(t("diff.notText", { name: f.name }), "fail");
      return;
    }
    src.value = d.text;
    frame.value = d.text;
  } catch (e) {
    toast(errText(e), "fail");
  }
}

useFileHandoff((files) => {
  if (files[0]) void load(files[0]);
});
onFilesDropped((files) => {
  if (files[0]) void load(files[0]);
});

async function pick() {
  const paths = await pickFiles(t("htmlprev.pick"), "HTML", ["html", "htm"], false);
  if (!paths[0]) return;
  void load({ path: paths[0], name: baseName(paths[0]), size: 0 });
}
</script>

<template>
  <ToolFrame tool-id="html-preview" shape="flow">
    <div class="field grow-field">
      <div class="head">
        <span class="lab">{{ t("htmlprev.source") }}</span>
        <button class="chip" @click="pick">{{ t("htmlprev.pick") }}</button>
        <button class="chip" @click="src = SAMPLE">{{ t("json.sample") }}</button>
        <button v-if="!autoRefresh" class="btn btn-sm btn-primary" @click="run">
          <Icon name="Play" /> {{ t("htmlprev.run") }}
        </button>
      </div>
      <textarea
        v-model="src"
        class="textarea mono grow"
        data-file-drop-target="html-preview"
        spellcheck="false"
      />
    </div>
    <template #result>
      <div class="preview">
        <div class="preview-toolbar">
          <span class="lab">{{ t("htmlprev.preview") }}</span>
          <div class="toolbar-right">
            <label class="chk-lab">
              <input type="checkbox" v-model="autoRefresh" />
              {{ t("htmlprev.autoRefresh") }}
            </label>
            <button
              class="chip mini-chip"
              :class="{ on: darkPreview }"
              @click="darkPreview = !darkPreview"
            >
              <Icon name="Moon" :size="12" />
            </button>
            <div class="device-btns">
              <button
                v-for="d in DEVICES"
                :key="d.id"
                class="dev-btn"
                :class="{ active: device === d.id }"
                :title="t(`htmlprev.${d.id}`)"
                @click="device = d.id"
              >
                <Icon :name="d.icon" :size="14" />
              </button>
            </div>
          </div>
        </div>
        <div class="frame-wrap">
          <iframe
            class="frame"
            :class="{ dark: darkPreview }"
            sandbox="allow-scripts"
            :srcdoc="wrappedFrame"
            :style="{ maxWidth: deviceWidth }"
            title="preview"
          />
        </div>
      </div>
    </template>
  </ToolFrame>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 8px; }
.head .lab { flex: 1; }
.grow-field { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
.grow { flex: 1; min-height: 200px; }

.preview { display: flex; flex-direction: column; gap: 0; height: 100%; }
.preview-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-bottom: 1px solid var(--line-2);
}
.toolbar-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.chk-lab { display: flex; align-items: center; gap: 5px; font-size: var(--t-xs); color: var(--f-2); cursor: pointer; }
.mini-chip { padding: 3px 6px; font-size: 10px; min-height: 0; display: flex; align-items: center; }

.device-btns { display: flex; gap: 2px; }
.dev-btn {
  padding: 4px 6px; border: 1px solid var(--line-2); background: var(--s-1);
  border-radius: var(--r-xs); cursor: pointer; color: var(--f-2); display: flex;
  align-items: center; transition: all 0.12s var(--ease);
}
.dev-btn:hover { color: var(--f-1); background: var(--s-2); }
.dev-btn.active { color: var(--acc); border-color: var(--acc); background: var(--cat-wash); }

.frame-wrap {
  flex: 1; display: flex; justify-content: center;
  padding: 12px; min-height: 0; overflow: auto;
}
.frame {
  flex: 1; width: 100%; height: 100%;
  border: 1px solid var(--line-2); border-radius: var(--r);
  background: #fff; transition: max-width 0.2s var(--ease);
}
.frame.dark { background: #1a1a1a; }
</style>
