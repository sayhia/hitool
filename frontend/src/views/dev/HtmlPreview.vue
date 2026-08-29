<script setup lang="ts">
import { ref } from "vue";
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

function run() {
  frame.value = src.value;
}

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
        <button class="btn btn-sm btn-primary" @click="run">
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
        <span class="lab">{{ t("htmlprev.preview") }}</span>
        <iframe class="frame" sandbox="allow-scripts" :srcdoc="frame" title="preview" />
      </div>
    </template>
  </ToolFrame>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 8px; }
.head .lab { flex: 1; }
.grow-field { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
.grow { flex: 1; min-height: 200px; }
.preview { display: flex; flex-direction: column; gap: 8px; height: 100%; padding: 14px; }
.frame {
  flex: 1; width: 100%; border: 1px solid var(--line-2); border-radius: var(--r);
  background: #fff;
}
</style>
