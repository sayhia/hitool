<script setup lang="ts">
/**
 * Checksums for text and files. Files stream through the Go service so a huge
 * input costs constant memory; text is hashed in the same place so the two
 * paths can never disagree.
 */
import { computed, onMounted, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import SourceTray from "../../work/SourceTray.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { errText } from "../../lib/err";
import { copyText, toast } from "../../stores/toast";
import { formatBytes } from "../../lib/backend";
import * as HashService from "@bindings/hitool/services/hashservice";
import type { FileHashResult, HashDigest } from "@bindings/hitool/services/models";
import type { FileInfo } from "@bindings/hitool/services/models";

const ALL_ALGOS = ["md5", "sha1", "sha256", "sha512", "crc32"];

const mode = ref<"text" | "file">("text");
const text = ref("");
const files = ref<FileInfo[]>([]);
const algos = ref<string[]>(["md5", "sha256"]);
const encoding = ref<"hex" | "base64">("hex");
const expect = ref("");
const busy = ref(false);

const textDigests = ref<HashDigest[]>([]);
const fileResults = ref<FileHashResult[]>([]);

onMounted(() => run());

function toggleAlgo(a: string) {
  algos.value = algos.value.includes(a)
    ? algos.value.filter((x) => x !== a)
    : ALL_ALGOS.filter((x) => algos.value.includes(x) || x === a);
  run();
}

const value = (d: HashDigest) => (encoding.value === "hex" ? d.hex : d.base64);

/** Text hashing is cheap enough to run on every keystroke. */
async function run() {
  if (mode.value !== "text") return;
  if (!algos.value.length) {
    textDigests.value = [];
    return;
  }
  try {
    textDigests.value = (await HashService.HashText(text.value, algos.value)) ?? [];
  } catch (e) {
    toast(errText(e), "fail");
  }
}

async function runFiles() {
  if (!files.value.length || busy.value || !algos.value.length) return;
  busy.value = true;
  fileResults.value = [];
  try {
    fileResults.value =
      (await HashService.HashFiles(files.value.map((f) => f.path), algos.value, expect.value)) ?? [];
    const bad = fileResults.value.filter((r) => r.error).length;
    if (bad) toast(t("hash.someFailed", { n: bad }), "fail");
  } catch (e) {
    toast(errText(e), "fail");
  } finally {
    busy.value = false;
  }
}

function cancel() {
  HashService.Cancel();
}

/** One line per file, ready to paste into a .sha256 sidecar file. */
const checksumFile = computed(() =>
  fileResults.value
    .flatMap((r) => (r.error || !r.digests?.length ? [] : [`${value(r.digests[0])}  ${r.name}`]))
    .join("\n"),
);

const compared = computed(() => fileResults.value.some((r) => r.compared));
</script>

<template>
  <ToolFrame tool-id="hash-calc" :shape="mode === 'file' ? 'batch' : 'flow'">
    <template v-if="mode === 'file'" #source>
      <SourceTray v-model="files" :multiple="true" :disabled="busy" filter-name="Files" />
    </template>

    <div class="seg modeseg">
      <button :class="{ on: mode === 'text' }" @click="mode = 'text'; run()">
        {{ t("hash.modeText") }}
      </button>
      <button :class="{ on: mode === 'file' }" @click="mode = 'file'">
        {{ t("hash.modeFile") }}
      </button>
    </div>

    <template v-if="mode === 'text'">
      <div class="field grow-field">
        <div class="head">
          <span class="lab">{{ t("hash.input") }}</span>
          <span v-if="text" class="badge">{{ text.length }}</span>
          <button class="btn btn-sm btn-quiet" :disabled="!text" @click="text = ''; run()">
            {{ t("common.clear") }}
          </button>
        </div>
        <textarea
          v-model="text"
          class="textarea mono src"
          :placeholder="t('hash.inputPh')"
          spellcheck="false"
          @input="run"
        ></textarea>
      </div>
    </template>

    <template v-else>
      <div class="field">
        <span class="lab">{{ t("hash.expect") }}</span>
        <input
          v-model="expect"
          class="input mono"
          :placeholder="t('hash.expectPh')"
          spellcheck="false"
        />
        <p class="hint">{{ t("hash.expectHint") }}</p>
      </div>
    </template>

    <!-- Result pane -->
    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("hash.digest") }}</span>
        <div class="seg encseg">
          <button :class="{ on: encoding === 'hex' }" @click="encoding = 'hex'">Hex</button>
          <button :class="{ on: encoding === 'base64' }" @click="encoding = 'base64'">Base64</button>
        </div>
        <button
          v-if="mode === 'file' && checksumFile"
          class="btn btn-sm btn-quiet"
          @click="copyText(checksumFile, t('common.copied'))"
        >
          <Icon name="Copy" /> {{ t("hash.copyAll") }}
        </button>
      </div>

      <div class="res-body scroll-y">
        <!-- text mode -->
        <template v-if="mode === 'text'">
          <button
            v-for="d in textDigests"
            :key="d.algo"
            class="digest"
            :title="t('common.copy')"
            @click="copyText(value(d), t('common.copied'))"
          >
            <span class="algo">{{ d.algo }}</span>
            <code class="mono val">{{ value(d) }}</code>
            <Icon name="Copy" />
          </button>
          <p v-if="!textDigests.length" class="hint pad">{{ t("hash.pickAlgo") }}</p>
        </template>

        <!-- file mode -->
        <template v-else>
          <div v-for="r in fileResults" :key="r.path" class="filecard">
            <div class="file-head">
              <span class="fname truncate" :title="r.path">{{ r.name }}</span>
              <span v-if="r.size" class="badge">{{ formatBytes(r.size) }}</span>
              <span v-if="r.compared" class="badge" :class="r.matched ? 'ok' : 'fail'">
                {{ r.matched ? t("hash.match") : t("hash.mismatch") }}
              </span>
            </div>
            <p v-if="r.error" class="banner fail">{{ r.error }}</p>
            <button
              v-for="d in r.digests"
              :key="d.algo"
              class="digest"
              :title="t('common.copy')"
              @click="copyText(value(d), t('common.copied'))"
            >
              <span class="algo">{{ d.algo }}</span>
              <code class="mono val">{{ value(d) }}</code>
              <Icon name="Copy" />
            </button>
          </div>
          <p v-if="!fileResults.length" class="hint pad">{{ t("hash.fileIdle") }}</p>
          <p v-else-if="compared" class="hint pad">{{ t("hash.compareNote") }}</p>
        </template>
      </div>
    </template>

    <template #inspector>
      <InspectorSection :title="t('hash.algos')" icon="Fingerprint">
        <div class="optlist">
          <button
            v-for="a in ALL_ALGOS"
            :key="a"
            class="opt"
            :class="{ on: algos.includes(a) }"
            @click="toggleAlgo(a)"
          >
            <Icon :name="algos.includes(a) ? 'CircleCheck' : 'Circle'" />
            {{ a.toUpperCase() }}
          </button>
        </div>
        <p v-if="!algos.length" class="hint">{{ t("hash.pickAlgo") }}</p>
      </InspectorSection>
    </template>

    <template v-if="mode === 'file'" #run>
      <button class="btn btn-signal" :disabled="!files.length || busy || !algos.length" @click="runFiles">
        <Icon v-if="busy" name="LoaderCircle" class="spin" />
        <Icon v-else name="Fingerprint" />
        {{ busy ? t("common.processing") : t("hash.run") }}
      </button>
      <button v-if="busy" class="btn btn-danger" @click="cancel">{{ t("common.cancel") }}</button>
      <p v-else-if="!files.length" class="hint">{{ t("bench.needFile") }}</p>
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
  min-height: 260px;
}

.res-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.encseg {
  width: 150px;
}

.res-head .btn {
  margin-left: auto;
}

.res-body {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pad {
  padding: 4px;
}

/* One digest = one copy target; the algorithm name anchors the left edge so
   the values line up in a column you can scan. */
.digest {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  padding: 8px 11px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-1);
  cursor: pointer;
  text-align: left;
  font-family: var(--f-ui);
}

.digest:hover {
  border-color: var(--acc-line);
  background: var(--acc-wash);
}

.algo {
  flex-shrink: 0;
  width: 58px;
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--acc);
}

.val {
  flex: 1;
  min-width: 0;
  font-size: var(--t-sm);
  color: var(--ink);
  word-break: break-all;
  user-select: text;
}

.digest :deep(svg) {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--ink-3);
  opacity: 0;
  align-self: center;
}

.digest:hover :deep(svg) {
  opacity: 1;
}

.filecard {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line-2);
}

.filecard:last-child {
  border-bottom: 0;
}

.file-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fname {
  font-size: var(--t-sm);
  font-weight: 600;
  min-width: 0;
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
  height: 34px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  font-family: var(--f-mono);
  font-size: var(--t-sm);
  font-weight: 600;
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
</style>
