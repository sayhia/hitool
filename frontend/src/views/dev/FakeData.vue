<script setup lang="ts">
/**
 * Test data for filling forms and fixtures.
 *
 * The ID numbers and card numbers carry real checksums, because a value the
 * form under test rejects is a value that never exercised anything. Nothing
 * here is drawn from a register — every digit past the published prefixes is
 * random, so a generated number belongs to nobody.
 */
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { FAKE_KINDS, generateRows, type FakeKind } from "../../lib/fake";

const chosen = ref<FakeKind[]>(["name", "phone", "id", "email"]);
const count = ref(10);
const rows = ref<string[][]>([]);
const drawn = ref(0);

function toggle(k: FakeKind) {
  chosen.value = chosen.value.includes(k)
    ? chosen.value.filter((x) => x !== k)
    : [...FAKE_KINDS.filter((x) => chosen.value.includes(x) || x === k)];
  draw();
}

function draw() {
  rows.value = chosen.value.length ? generateRows(chosen.value, count.value) : [];
  drawn.value++;
}

draw();

const asTsv = computed(() =>
  [chosen.value.map((k) => t(`fake.k_${k}`)).join("\t"), ...rows.value.map((r) => r.join("\t"))].join("\n"),
);

const asCsv = computed(() => {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [
    chosen.value.map((k) => esc(t(`fake.k_${k}`))).join(","),
    ...rows.value.map((r) => r.map(esc).join(",")),
  ].join("\n");
});

const asJson = computed(() =>
  JSON.stringify(
    rows.value.map((r) => Object.fromEntries(chosen.value.map((k, i) => [k, r[i]]))),
    null,
    2,
  ),
);
</script>

<template>
  <ToolFrame tool-id="fake-data" shape="flow">
    <div class="field">
      <span class="lab">{{ t("fake.fields") }}</span>
      <div class="chips">
        <button
          v-for="k in FAKE_KINDS"
          :key="k"
          class="chip"
          :class="{ on: chosen.includes(k) }"
          @click="toggle(k)"
        >
          {{ t(`fake.k_${k}`) }}
        </button>
      </div>
    </div>

    <div class="row">
      <div class="field narrow">
        <span class="lab">{{ t("fake.count") }}</span>
        <input v-model.number="count" type="number" min="1" max="1000" class="input mono num" />
      </div>
      <button class="btn btn-signal go" :disabled="!chosen.length" @click="draw">
        <Icon name="RefreshCw" /> {{ t("fake.draw") }}
      </button>
      <span v-if="!chosen.length" class="hint">{{ t("fake.pickOne") }}</span>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("fake.result") }}</span>
        <span class="badge">{{ rows.length }}</span>
        <div class="copies">
          <button class="btn btn-sm btn-quiet" :disabled="!rows.length" @click="copyText(asTsv, t('common.copied'))">TSV</button>
          <button class="btn btn-sm btn-quiet" :disabled="!rows.length" @click="copyText(asCsv, t('common.copied'))">CSV</button>
          <button class="btn btn-sm btn-quiet" :disabled="!rows.length" @click="copyText(asJson, t('common.copied'))">JSON</button>
        </div>
      </div>

      <div class="tablewrap scroll-y">
        <table v-if="rows.length" class="tbl mono">
          <thead>
            <tr>
              <th class="idx">#</th>
              <th v-for="k in chosen" :key="k">{{ t(`fake.k_${k}`) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="`${drawn}-${i}`">
              <td class="idx">{{ i + 1 }}</td>
              <td
                v-for="(v, j) in r"
                :key="j"
                :title="t('common.copy')"
                @click="copyText(v, t('common.copied'))"
              >
                {{ v }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="hint pad">{{ t("fake.idle") }}</p>
      </div>
    </template>

    <template #inspector>
      <InspectorSection :title="t('fake.about')" icon="Info" :open="true">
        <p class="hint">{{ t("fake.aboutChecksum") }}</p>
        <p class="hint">{{ t("fake.aboutPrivacy") }}</p>
        <p class="hint">{{ t("fake.aboutCopy") }}</p>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.narrow {
  width: 120px;
}

.num {
  text-align: right;
}

.go {
  margin-bottom: 1px;
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
  gap: 4px;
}

.tablewrap {
  flex: 1;
  /* Many columns of fixture data will not fit; let the table scroll itself
     rather than pushing the pane wider. */
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
  white-space: nowrap;
  cursor: pointer;
  user-select: text;
}

.tbl tbody tr:hover td {
  background: var(--s-2);
}

.idx {
  color: var(--ink-4);
  text-align: right;
  width: 44px;
  cursor: default !important;
}
</style>
