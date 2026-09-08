<script setup lang="ts">
/**
 * The codec bench: Base64, URL and HTML entities behind one mode switch.
 * The three tools were separate pages with the same skeleton — text in,
 * encoded/decoded text out — so they share one frame now; the URL mode
 * keeps its own query/text sub-modes and the editable param table.
 */
import { computed, ref, watch } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { errText } from "../../lib/err";
import { copyText, toast } from "../../stores/toast";
import { inWails, pickFiles, formatBytes, baseName } from "../../lib/backend";
import {
  base64ToUtf8,
  buildQuery,
  fromBase64Url,
  isProbablyBase64,
  parseQuery,
  safeDecode,
  toBase64Url,
  utf8ToBase64,
  type QueryParam,
} from "../../lib/codec";
import { decodeHtml, encodeHtml } from "../../lib/htmlEntities";
import * as HashService from "@bindings/hitool/services/hashservice";
import * as SystemService from "@bindings/hitool/services/systemservice";

const mode = ref<"base64" | "url" | "html">("base64");

// ---------- base64 ----------
const dir = ref<"encode" | "decode">("encode");
const urlSafe = ref(false);
const wrap = ref(false);
const b64in = ref("");
const fileOut = ref("");
const fileName = ref("");
const busy = ref(false);

/** Re-wrap at 76 columns, the MIME convention for embedding in mail/PEM. */
function wrapLines(s: string) {
  return s.replace(/(.{76})/g, "$1\n");
}

const b64out = computed<{ text: string; error: string }>(() => {
  if (!b64in.value.trim()) return { text: "", error: "" };
  try {
    if (dir.value === "encode") {
      let out = utf8ToBase64(b64in.value);
      if (urlSafe.value) out = toBase64Url(out);
      return { text: wrap.value ? wrapLines(out) : out, error: "" };
    }
    const src = urlSafe.value ? fromBase64Url(b64in.value.trim()) : b64in.value;
    return { text: base64ToUtf8(src), error: "" };
  } catch (e) {
    return { text: "", error: (e as Error).message };
  }
});

/** Nudge the user when they've clearly pasted the other direction's input. */
const hintSwap = computed(
  () => dir.value === "encode" && b64in.value.length > 8 && isProbablyBase64(b64in.value),
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
  const produced = b64out.value.text;
  dir.value = dir.value === "encode" ? "decode" : "encode";
  if (produced) b64in.value = produced;
}

// ---------- url ----------
const SAMPLE = "https://example.com/search?q=中文 查询&page=2&tags=a,b#results";

const urlMode = ref<"query" | "text">("query");
const url = ref("");
const urlText = ref("");
const component = ref(true);

const parsed = computed(() => parseQuery(url.value));
const params = ref<QueryParam[]>([]);
const base = ref("");
const hash = ref("");

// Re-derive the editable table whenever the URL box changes.
watch(
  parsed,
  (p) => {
    params.value = p.params.map((x) => ({ ...x }));
    base.value = p.base;
    hash.value = p.hash;
  },
  { immediate: true },
);

const rebuilt = computed(() => buildQuery(base.value, params.value, hash.value));

function addParam() {
  params.value = [...params.value, { key: "", value: "" }];
}

function removeParam(i: number) {
  params.value = params.value.filter((_, idx) => idx !== i);
}

const urlEncoded = computed(() => {
  if (!urlText.value) return "";
  try {
    return component.value ? encodeURIComponent(urlText.value) : encodeURI(urlText.value);
  } catch (e) {
    return (e as Error).message;
  }
});

const urlDecoded = computed(() => (urlText.value ? safeDecode(urlText.value) : ""));

// ---------- html entities ----------
const htmlSrc = ref("");
const numeric = ref(false);
const htmlEncoded = computed(() => (htmlSrc.value ? encodeHtml(htmlSrc.value, numeric.value) : ""));
const htmlDecoded = computed(() => (htmlSrc.value ? decodeHtml(htmlSrc.value) : ""));
</script>

<template>
  <ToolFrame tool-id="codec" shape="flow">
    <div class="seg modeseg">
      <button :class="{ on: mode === 'base64' }" @click="mode = 'base64'">Base64</button>
      <button :class="{ on: mode === 'url' }" @click="mode = 'url'">URL</button>
      <button :class="{ on: mode === 'html' }" @click="mode = 'html'">HTML</button>
    </div>

    <!-- ================= base64 ================= -->
    <template v-if="mode === 'base64'">
      <div class="row">
        <div class="seg dirseg">
          <button :class="{ on: dir === 'encode' }" @click="dir = 'encode'">{{ t("b64.encode") }}</button>
          <button :class="{ on: dir === 'decode' }" @click="dir = 'decode'">{{ t("b64.decode") }}</button>
        </div>
        <button class="btn btn-sm" :disabled="!b64out.text" @click="swap">
          <Icon name="ArrowLeftRight" /> {{ t("b64.swap") }}
        </button>
        <button class="btn btn-sm btn-quiet" :disabled="!b64in" @click="b64in = ''">
          {{ t("common.clear") }}
        </button>
      </div>

      <p v-if="hintSwap" class="banner info">
        <Icon name="Info" /> {{ t("b64.looksEncoded") }}
      </p>

      <div class="field grow-field">
        <div class="head">
          <span class="lab">{{ dir === "encode" ? t("b64.plain") : t("b64.encoded") }}</span>
          <span v-if="b64in" class="badge">{{ b64in.length }}</span>
        </div>
        <textarea
          v-model="b64in"
          class="textarea mono src"
          :class="{ bad: !!b64out.error }"
          :placeholder="dir === 'encode' ? t('b64.plainPh') : t('b64.encodedPh')"
          spellcheck="false"
        ></textarea>
        <p v-if="b64out.error" class="err mono">{{ b64out.error }}</p>
      </div>
    </template>

    <!-- ================= url ================= -->
    <template v-else-if="mode === 'url'">
      <div class="seg urlmodeseg">
        <button :class="{ on: urlMode === 'query' }" @click="urlMode = 'query'">{{ t("url.modeQuery") }}</button>
        <button :class="{ on: urlMode === 'text' }" @click="urlMode = 'text'">{{ t("url.modeText") }}</button>
      </div>

      <template v-if="urlMode === 'query'">
        <div class="field">
          <div class="head">
            <span class="lab">{{ t("url.input") }}</span>
            <button class="chip" @click="url = SAMPLE">{{ t("json.sample") }}</button>
            <button class="chip" :disabled="!url" @click="url = ''">{{ t("common.clear") }}</button>
          </div>
          <textarea
            v-model="url"
            class="textarea mono urlin"
            :placeholder="t('url.inputPh')"
            spellcheck="false"
          ></textarea>
        </div>

        <div v-if="params.length || base" class="field">
          <div class="head">
            <span class="lab">{{ t("url.params") }}</span>
            <span class="badge">{{ params.length }}</span>
            <button class="btn btn-sm btn-quiet" @click="addParam">
              <Icon name="Plus" /> {{ t("url.addParam") }}
            </button>
          </div>
          <div class="ptable">
            <div v-for="(p, i) in params" :key="i" class="prow">
              <input v-model="p.key" class="input mono pkey" :placeholder="t('url.key')" />
              <input v-model="p.value" class="input mono pval" :placeholder="t('url.value')" />
              <button class="btn btn-sm btn-quiet btn-icon" @click="removeParam(i)">
                <Icon name="X" />
              </button>
            </div>
            <p v-if="!params.length" class="hint">{{ t("url.noParams") }}</p>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="field grow-field">
          <div class="head">
            <span class="lab">{{ t("url.text") }}</span>
            <span v-if="urlText" class="badge">{{ urlText.length }}</span>
          </div>
          <textarea
            v-model="urlText"
            class="textarea mono src"
            :placeholder="t('url.textPh')"
            spellcheck="false"
          ></textarea>
        </div>
      </template>
    </template>

    <!-- ================= html entities ================= -->
    <template v-else>
      <div class="field grow-field">
        <div class="head">
          <span class="lab">{{ t("htmlent.input") }}</span>
          <label class="chk">
            <input v-model="numeric" type="checkbox" />
            {{ t("htmlent.numeric") }}
          </label>
          <button class="chip" :disabled="!htmlSrc" @click="htmlSrc = ''">{{ t("common.clear") }}</button>
        </div>
        <textarea
          v-model="htmlSrc"
          class="textarea mono src"
          :placeholder="t('htmlent.inputPh')"
          spellcheck="false"
        />
      </div>
    </template>

    <template #result>
      <!-- base64 -->
      <template v-if="mode === 'base64'">
        <div class="res-head res-pad">
          <span class="lab">{{ dir === "encode" ? t("b64.encoded") : t("b64.plain") }}</span>
          <span v-if="b64out.text" class="badge">{{ b64out.text.length }}</span>
          <button
            class="btn btn-sm btn-quiet"
            :disabled="!b64out.text"
            @click="copyText(b64out.text, t('common.copied'))"
          >
            <Icon name="Copy" /> {{ t("common.copy") }}
          </button>
        </div>
        <div class="out mono scroll-y">
          <template v-if="b64out.text">{{ b64out.text }}</template>
          <span v-else class="hint">{{ t("b64.idle") }}</span>
        </div>
      </template>

      <!-- url: query -->
      <template v-else-if="mode === 'url' && urlMode === 'query'">
        <div class="res-head res-pad">
          <span class="lab">{{ t("url.rebuilt") }}</span>
          <button
            class="btn btn-sm btn-quiet"
            :disabled="!rebuilt"
            @click="copyText(rebuilt, t('common.copied'))"
          >
            <Icon name="Copy" /> {{ t("common.copy") }}
          </button>
        </div>
        <div class="out mono scroll-y">
          <template v-if="rebuilt">{{ rebuilt }}</template>
          <span v-else class="hint">{{ t("url.idle") }}</span>
        </div>
      </template>

      <!-- url: text -->
      <template v-else-if="mode === 'url'">
        <div class="res-head res-pad">
          <span class="lab">{{ t("url.result") }}</span>
        </div>
        <div class="res-body scroll-y">
          <div class="block">
            <div class="block-head">
              <span class="lab">{{ t("url.encoded") }}</span>
              <button
                class="btn btn-sm btn-quiet"
                :disabled="!urlEncoded"
                @click="copyText(urlEncoded, t('common.copied'))"
              >
                <Icon name="Copy" />
              </button>
            </div>
            <code class="out-box mono">{{ urlEncoded || "—" }}</code>
          </div>
          <div class="block">
            <div class="block-head">
              <span class="lab">{{ t("url.decoded") }}</span>
              <button
                class="btn btn-sm btn-quiet"
                :disabled="!urlDecoded"
                @click="copyText(urlDecoded, t('common.copied'))"
              >
                <Icon name="Copy" />
              </button>
            </div>
            <code class="out-box mono">{{ urlDecoded || "—" }}</code>
          </div>
        </div>
      </template>

      <!-- html entities -->
      <template v-else>
        <div class="res-body scroll-y">
          <div class="block">
            <div class="block-head">
              <span class="lab">{{ t("htmlent.encoded") }}</span>
              <button class="btn btn-sm btn-quiet" :disabled="!htmlEncoded" @click="copyText(htmlEncoded, t('common.copied'))">
                <Icon name="Copy" />
              </button>
            </div>
            <pre class="out-box mono">{{ htmlEncoded || t("htmlent.idle") }}</pre>
          </div>
          <div class="block">
            <div class="block-head">
              <span class="lab">{{ t("htmlent.decoded") }}</span>
              <button class="btn btn-sm btn-quiet" :disabled="!htmlDecoded" @click="copyText(htmlDecoded, t('common.copied'))">
                <Icon name="Copy" />
              </button>
            </div>
            <pre class="out-box mono">{{ htmlDecoded || t("htmlent.idle") }}</pre>
          </div>
        </div>
      </template>
    </template>

    <template #inspector>
      <!-- base64 -->
      <template v-if="mode === 'base64'">
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
            <button class="btn btn-sm btn-quiet" @click="b64in = fileOut; dir = 'decode'">
              {{ t("b64.toInput") }}
            </button>
          </template>
        </InspectorSection>
      </template>

      <!-- url -->
      <template v-else-if="mode === 'url'">
        <InspectorSection v-if="urlMode === 'query'" :title="t('url.parts')" icon="Link">
          <label class="field">
            <span class="lab">{{ t("url.base") }}</span>
            <input v-model="base" class="input mono" spellcheck="false" />
          </label>
          <label class="field">
            <span class="lab">{{ t("url.hash") }}</span>
            <input v-model="hash" class="input mono" spellcheck="false" />
          </label>
        </InspectorSection>

        <InspectorSection v-else :title="t('b64.options')" icon="Settings2">
          <div class="optlist">
            <button class="opt" :class="{ on: component }" @click="component = true">
              encodeURIComponent
            </button>
            <button class="opt" :class="{ on: !component }" @click="component = false">
              encodeURI
            </button>
          </div>
          <p class="hint">{{ component ? t("url.componentHint") : t("url.uriHint") }}</p>
        </InspectorSection>
      </template>
    </template>
  </ToolFrame>
</template>

<style scoped>
.modeseg {
  width: 260px;
}

.urlmodeseg {
  width: 220px;
}

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
  gap: 8px;
}

.head .btn,
.head .chip:first-of-type {
  margin-left: auto;
}

.head .chip + .chip {
  margin-left: 0;
}

.grow-field {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.src {
  flex: 1;
  min-height: 220px;
}

.urlin {
  min-height: 88px;
  font-size: var(--t-sm);
}

.textarea.bad {
  border-color: var(--fail);
}

.err {
  font-size: var(--t-xs);
  color: var(--fail);
  word-break: break-word;
}

.chk {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--t-sm);
  color: var(--ink-2);
}

/* Param table: key and value share the row, remove sits at the end. */
.ptable {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.prow {
  display: flex;
  gap: 6px;
  align-items: center;
}

.pkey {
  flex: 0 0 30%;
}

.pval {
  flex: 1;
  min-width: 0;
}

.res-pad {
  padding: 11px 14px;
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

.res-body {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.block-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.block-head .btn {
  margin-left: auto;
}

.out-box {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-1);
  color: var(--ink-2);
  font-size: var(--t-sm);
  line-height: 1.7;
  word-break: break-all;
  white-space: pre-wrap;
  overflow: auto;
  user-select: text;
}

/* Monospace flavour labels for the URL encoder choice. */
.optlist {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.opt {
  height: 32px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  font-family: var(--f-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.opt:hover:not(.on) {
  background: var(--s-3);
  color: var(--ink);
}

.opt.on {
  background: var(--cat-wash);
  border-color: var(--cat-line);
  color: var(--cat);
}
</style>
