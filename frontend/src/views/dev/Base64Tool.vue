<script setup lang="ts">
/**
 * Base64 for text and files. Text runs through TextEncoder so CJK and emoji
 * survive the trip, which plain btoa would not manage.
 */
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { errText } from "../../lib/err";
import { copyText, toast } from "../../stores/toast";
import { inWails, pickFiles, formatBytes, baseName } from "../../lib/backend";
import {
  base64ToUtf8,
  fromBase64Url,
  isProbablyBase64,
  toBase64Url,
  utf8ToBase64,
} from "../../lib/codec";
import * as HashService from "@bindings/hitool/services/hashservice";
import * as SystemService from "@bindings/hitool/services/systemservice";

const dir = ref<"encode" | "decode">("encode");
const urlSafe = ref(false);
const wrap = ref(false);
const input = ref("");
const fileOut = ref("");
const fileName = ref("");
const busy = ref(false);

/** Re-wrap at 76 columns, the MIME convention for embedding in mail/PEM. */
function wrapLines(s: string) {
  return s.replace(/(.{76})/g, "$1\n");
}

const result = computed<{ text: string; error: string }>(() => {
  if (!input.value.trim()) return { text: "", error: "" };
  try {
    if (dir.value === "encode") {
      let out = utf8ToBase64(input.value);
      if (urlSafe.value) out = toBase64Url(out);
      return { text: wrap.value ? wrapLines(out) : out, error: "" };
    }
    const src = urlSafe.value ? fromBase64Url(input.value.trim()) : input.value;
    return { text: base64ToUtf8(src), error: "" };
  } catch (e) {
    return { text: "", error: (e as Error).message };
  }
});

/** Nudge the user when they've clearly pasted the other direction's input. */
const hintSwap = computed(
  () => dir.value === "encode" && input.value.length > 8 && isProbablyBase64(input.value),
);

async function encodeFile(asDataURI: boolean) {
  if (!inWails()) {
    toast(t("b64.desktopOnly"), "fail");
    return;
  }
  const paths = await pickFiles(t("common.selectFile"), "Files", [], false);
  if (!paths.length) return;
  busy.value = true;
  try {
    fileOut.value = await HashService.EncodeFileBase64(paths[0], asDataURI, "");
    fileName.value = baseName(paths[0]);
    const size = await SystemService.GetFileSize(paths[0]).catch(() => 0);
    toast(t("b64.fileDone", { name: fileName.value, size: formatBytes(size) }), "ok");
  } catch (e) {
    toast(errText(e), "fail");
  } finally {
    busy.value = false;
  }
}

function swap() {
  const produced = result.value.text;
  dir.value = dir.value === "encode" ? "decode" : "encode";
  if (produced) input.value = produced;
}
</script>

<template>
  <ToolFrame tool-id="base64-tool" shape="flow">
    <div class="row">
      <div class="seg dirseg">
        <button :class="{ on: dir === 'encode' }" @click="dir = 'encode'">{{ t("b64.encode") }}</button>
        <button :class="{ on: dir === 'decode' }" @click="dir = 'decode'">{{ t("b64.decode") }}</button>
      </div>
      <button class="btn btn-sm" :disabled="!result.text" @click="swap">
        <Icon name="ArrowLeftRight" /> {{ t("b64.swap") }}
      </button>
      <button class="btn btn-sm btn-quiet" :disabled="!input" @click="input = ''">
        {{ t("common.clear") }}
      </button>
    </div>

    <p v-if="hintSwap" class="banner info">
      <Icon name="Info" /> {{ t("b64.looksEncoded") }}
    </p>

    <div class="field grow-field">
      <div class="head">
        <span class="lab">{{ dir === "encode" ? t("b64.plain") : t("b64.encoded") }}</span>
        <span v-if="input" class="badge">{{ input.length }}</span>
      </div>
      <textarea
        v-model="input"
        class="textarea mono src"
        :class="{ bad: !!result.error }"
        :placeholder="dir === 'encode' ? t('b64.plainPh') : t('b64.encodedPh')"
        spellcheck="false"
      ></textarea>
      <p v-if="result.error" class="err mono">{{ result.error }}</p>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ dir === "encode" ? t("b64.encoded") : t("b64.plain") }}</span>
        <span v-if="result.text" class="badge">{{ result.text.length }}</span>
        <button
          class="btn btn-sm btn-quiet"
          :disabled="!result.text"
          @click="copyText(result.text, t('common.copied'))"
        >
          <Icon name="Copy" /> {{ t("common.copy") }}
        </button>
      </div>
      <div class="out mono scroll-y">
        <template v-if="result.text">{{ result.text }}</template>
        <span v-else class="hint">{{ t("b64.idle") }}</span>
      </div>
    </template>

    <template #inspector>
      <InspectorSection :title="t('b64.options')" icon="Settings2">
        <button class="chip" :class="{ on: urlSafe }" @click="urlSafe = !urlSafe">
          {{ t("b64.urlSafe") }}
        </button>
        <button
          v-if="dir === 'encode'"
          class="chip"
          :class="{ on: wrap }"
          @click="wrap = !wrap"
        >
          {{ t("b64.wrap") }}
        </button>
        <p class="hint">{{ urlSafe ? t("b64.urlSafeHint") : t("b64.stdHint") }}</p>
      </InspectorSection>

      <InspectorSection :title="t('b64.fromFile')" icon="FileUp">
        <button class="btn btn-sm" :disabled="busy" @click="encodeFile(false)">
          <Icon name="FileUp" /> {{ t("b64.fileBase64") }}
        </button>
        <button class="btn btn-sm" :disabled="busy" @click="encodeFile(true)">
          <Icon name="Link" /> {{ t("b64.fileDataUri") }}
        </button>
        <template v-if="fileOut">
          <p class="hint truncate">{{ fileName }} · {{ fileOut.length }}</p>
          <button class="btn btn-sm btn-signal" @click="copyText(fileOut, t('common.copied'))">
            <Icon name="Copy" /> {{ t("common.copy") }}
          </button>
          <button class="btn btn-sm btn-quiet" @click="input = fileOut; dir = 'decode'">
            {{ t("b64.toInput") }}
          </button>
        </template>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.dirseg {
  width: 190px;
}

.head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.grow-field {
  flex: 1;
  min-height: 0;
}

.src {
  flex: 1;
  min-height: 260px;
}

.textarea.bad {
  border-color: var(--fail);
}

.err {
  font-size: var(--t-xs);
  color: var(--fail);
  word-break: break-word;
}

.res-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.res-head .btn {
  margin-left: auto;
}

.out {
  flex: 1;
  padding: 13px 14px;
  font-size: var(--t-sm);
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
}
</style>
