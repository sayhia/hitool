<script setup lang="ts">
/**
 * CSV / TSV: read it, look at it, convert it.
 *
 * The parser follows RFC 4180 rather than splitting on the delimiter, which
 * matters as soon as one field contains a comma — the failure mode there is
 * not an error message but every later column shifted by one, found days
 * later in whatever consumed the file.
 */
import { computed, ref, watch } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText, toast } from "../../stores/toast";
import { errText } from "../../lib/err";
import { pickFiles, readFileBytes, formatBytes } from "../../lib/backend";
import { onFilesDropped, dragActive, useFileHandoff } from "../../lib/drop";
import { decodeText, MAX_TEXT_BYTES } from "../../lib/textfile";
import {
  DELIMITERS,
  columnStats,
  detectDelimiter,
  parse,
  rectangular,
  selectColumns,
  stringify,
  toJson,
  toMarkdown,
  transpose,
  width,
  type Delimiter,
} from "../../lib/csv";
import { csvToObjects, objectsToCsv } from "../../lib/jsonCsv";
import type { FileInfo } from "@bindings/hitool/services/models";

const SAMPLE = `name,role,city,joined
"Smith, John",engineer,上海,2023-04-01
Ada Lovelace,"analyst, senior",北京,2024-11-12
Bo,designer,广州,2025-02-28`;

const src = ref(SAMPLE);
const name = ref("");
const delimiter = ref<Delimiter>(",");
const header = ref(true);
const coerce = ref(true);
const auto = ref(true);
const hidden = ref<Set<number>>(new Set());
const flipped = ref(false);

const rows = computed(() => {
  const grid = rectangular(parse(src.value, delimiter.value));
  return flipped.value ? transpose(grid) : grid;
});

const cols = computed(() => width(rows.value));
const kept = computed(() => Array.from({ length: cols.value }, (_, i) => i).filter((i) => !hidden.value.has(i)));
const shown = computed(() => selectColumns(rows.value, kept.value));
const stats = computed(() => columnStats(rows.value, header.value));

const headRow = computed(() =>
  header.value && shown.value.length ? shown.value[0] : kept.value.map((i) => `${i + 1}`),
);
const bodyRows = computed(() => (header.value ? shown.value.slice(1) : shown.value));

// Re-guess the delimiter whenever the text changes, unless it was set by hand.
watch(
  src,
  (v) => {
    if (auto.value && v.trim()) delimiter.value = detectDelimiter(v);
  },
  { immediate: true },
);

watch([src, flipped], () => {
  hidden.value = new Set();
});

function toggleCol(i: number) {
  const next = new Set(hidden.value);
  if (next.has(i)) next.delete(i);
  else next.add(i);
  hidden.value = next;
}

const asJson = computed(() =>
  JSON.stringify(toJson(shown.value, { header: header.value, coerce: coerce.value }), null, 2),
);
const asNestedJson = computed(() => JSON.stringify(csvToObjects(asCsv.value), null, 2));

function ingest(text: string, fname = "") {
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{") || /\.json$/i.test(fname)) {
    try {
      const data = JSON.parse(trimmed);
      const records = Array.isArray(data) ? data : [data];
      src.value = objectsToCsv(records);
      name.value = fname;
      return;
    } catch {
      /* treat as CSV */
    }
  }
  src.value = text;
  name.value = fname;
}
const asMarkdown = computed(() => toMarkdown(shown.value, header.value));
const asTsv = computed(() => stringify(shown.value, "\t"));
const asCsv = computed(() => stringify(shown.value, ","));

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
    ingest(d.text, f.name);
  } catch (e) {
    toast(errText(e), "fail");
  }
}

onFilesDropped((files) => load(files[0]));
useFileHandoff((files) => load(files[0]));

async function choose() {
  const paths = await pickFiles(t("common.selectFiles"), "CSV / JSON", ["csv", "tsv", "txt", "json"], false);
  if (!paths.length) return;
  const { StatFiles } = await import("@bindings/hitool/services/systemservice");
  const stat = (await StatFiles(paths)) ?? [];
  if (stat.length) load(stat[0]);
}
</script>

<template>
  <ToolFrame tool-id="csv-tool" shape="flow">
    <div class="field grow-field" :class="{ hot: dragActive }" data-file-drop-target="csv">
      <div class="head">
        <span class="lab">{{ t("csv.source") }}</span>
        <span v-if="name" class="fname truncate" :title="name">{{ name }}</span>
        <span v-if="rows.length" class="badge">{{ rows.length }} × {{ cols }}</span>
        <button class="mini" :title="t('diff.openFile')" @click="choose">
          <Icon name="FolderOpen" />
        </button>
      </div>
      <textarea
        v-model="src"
        class="textarea mono doc"
        :placeholder="t('csv.sourcePh')"
        spellcheck="false"
        @input="name = ''"
      ></textarea>
    </div>

    <div class="row">
      <div class="field">
        <span class="lab">{{ t("csv.delimiter") }}</span>
        <div class="seg">
          <button
            v-for="d in DELIMITERS"
            :key="d.id"
            :class="{ on: delimiter === d.id }"
            @click="delimiter = d.id; auto = false"
          >
            {{ t(`csv.d_${d.key}`) }}
          </button>
        </div>
      </div>
      <button class="chip" :class="{ on: auto }" @click="auto = !auto">{{ t("csv.auto") }}</button>
      <button class="chip" :class="{ on: header }" @click="header = !header">{{ t("csv.header") }}</button>
      <button class="chip" :class="{ on: flipped }" @click="flipped = !flipped">{{ t("csv.transpose") }}</button>
      <button class="btn btn-sm btn-quiet" @click="src = SAMPLE; name = ''">{{ t("csv.sample") }}</button>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("csv.table") }}</span>
        <span v-if="hidden.size" class="badge warn">{{ t("csv.hiddenCols", { n: hidden.size }) }}</span>
        <div class="copies">
          <button class="btn btn-sm btn-quiet" :disabled="!rows.length" @click="copyText(asJson, t('common.copied'))">JSON</button>
          <button class="btn btn-sm btn-quiet" :disabled="!rows.length" @click="copyText(asNestedJson, t('common.copied'))">{{ t("csv.nestedJson") }}</button>
          <button class="btn btn-sm btn-quiet" :disabled="!rows.length" @click="copyText(asMarkdown, t('common.copied'))">MD</button>
          <button class="btn btn-sm btn-quiet" :disabled="!rows.length" @click="copyText(asCsv, t('common.copied'))">CSV</button>
          <button class="btn btn-sm btn-quiet" :disabled="!rows.length" @click="copyText(asTsv, t('common.copied'))">TSV</button>
        </div>
      </div>

      <div class="tablewrap scroll-y">
        <table v-if="rows.length" class="tbl mono">
          <thead>
            <tr>
              <th class="idx">#</th>
              <th v-for="(h, i) in headRow" :key="i">{{ h || "—" }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in bodyRows.slice(0, 500)" :key="i">
              <td class="idx">{{ i + 1 }}</td>
              <td
                v-for="(c, j) in r"
                :key="j"
                :title="c"
                @click="c && copyText(c, t('common.copied'))"
              >
                {{ c }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="hint pad">{{ t("csv.idle") }}</p>
        <p v-if="bodyRows.length > 500" class="hint pad">
          {{ t("csv.truncated", { n: bodyRows.length }) }}
        </p>
      </div>
    </template>

    <template #inspector>
      <InspectorSection v-if="stats.length" :title="t('csv.columns')" icon="Columns3" :open="true">
        <div class="collist">
          <button
            v-for="(c, i) in stats"
            :key="i"
            class="col"
            :class="{ off: hidden.has(i) }"
            @click="toggleCol(i)"
          >
            <Icon :name="hidden.has(i) ? 'EyeOff' : 'Eye'" />
            <span class="cname truncate">{{ c.name }}</span>
            <span v-if="c.numeric" class="badge">123</span>
            <span class="lab">{{ c.unique }}/{{ c.filled }}</span>
          </button>
        </div>
        <p class="hint">{{ t("csv.colHint") }}</p>
      </InspectorSection>

      <InspectorSection :title="t('csv.json')" icon="Braces">
        <button class="chip" :class="{ on: coerce }" @click="coerce = !coerce">{{ t("csv.coerce") }}</button>
        <p class="hint">{{ t("csv.coerceHint") }}</p>
      </InspectorSection>

      <InspectorSection :title="t('csv.about')" icon="Info">
        <p class="hint">{{ t("csv.aboutQuotes") }}</p>
        <p class="hint">{{ t("csv.aboutDetect") }}</p>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
.grow-field {
  flex: 1;
  min-height: 0;
  border-radius: var(--r);
  transition: box-shadow 0.14s;
}

.grow-field.hot {
  box-shadow: 0 0 0 2px var(--acc);
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fname {
  flex: 1;
  min-width: 0;
  font-size: var(--t-xs);
  color: var(--ink-3);
  font-family: var(--f-mono);
}

.mini {
  margin-left: auto;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
}

.mini:hover {
  background: var(--s-3);
  color: var(--ink);
}

.mini :deep(svg) {
  width: 13px;
  height: 13px;
}

.doc {
  flex: 1;
  min-height: 200px;
}

.row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.res-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.copies {
  margin-left: auto;
  display: flex;
  gap: 3px;
}

.tablewrap {
  flex: 1;
  overflow-x: auto;
}

.pad {
  padding: 12px 14px;
}

.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--t-sm);
}

.tbl th {
  position: sticky;
  top: 0;
  background: var(--s-1);
  text-align: left;
  font-weight: 500;
  font-size: var(--t-xs);
  color: var(--ink-3);
  padding: 7px 10px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
  z-index: 1;
}

.tbl td {
  padding: 5px 10px;
  border-bottom: 1px solid var(--line-2);
  cursor: pointer;
  user-select: text;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tbl tbody tr:hover td {
  background: var(--s-2);
}

.idx {
  color: var(--ink-4);
  text-align: right;
  width: 46px;
  cursor: default !important;
}

.collist {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.col {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: var(--f-ui);
  font-size: var(--t-xs);
  color: var(--ink);
}

.col:hover {
  background: var(--s-3);
}

.col.off {
  opacity: 0.45;
}

.col :deep(svg) {
  width: 12px;
  height: 12px;
  color: var(--ink-4);
  flex-shrink: 0;
}

.cname {
  flex: 1;
  min-width: 0;
}

.col .lab {
  flex-shrink: 0;
}
</style>
