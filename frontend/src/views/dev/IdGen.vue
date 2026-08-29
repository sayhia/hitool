<script setup lang="ts">
/**
 * UUID / ULID / Nano ID generator.
 *
 * Everything comes from `crypto.getRandomValues` and never leaves the window —
 * an id fetched from a website is an id somebody else has seen.
 */
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { generate, type IdKind } from "../../lib/ids";

const KINDS: { id: IdKind; note: string }[] = [
  { id: "uuid4", note: "kindUuid4" },
  { id: "uuid7", note: "kindUuid7" },
  { id: "ulid", note: "kindUlid" },
  { id: "nano", note: "kindNano" },
];

const kind = ref<IdKind>("uuid4");
const count = ref(10);
const compact = ref(false);
const uppercase = ref(false);
const size = ref(21);
const ids = ref<string[]>([]);
/** Bumped on every draw so the list animates and the copy button re-enables. */
const drawn = ref(0);

const isUuid = computed(() => kind.value === "uuid4" || kind.value === "uuid7");

function draw() {
  ids.value = generate(kind.value, {
    count: count.value,
    compact: compact.value,
    uppercase: uppercase.value,
    size: size.value,
  });
  drawn.value++;
}

draw();

const asText = computed(() => ids.value.join("\n"));

function copyOne(v: string) {
  copyText(v, t("common.copied"));
}
</script>

<template>
  <ToolFrame tool-id="id-gen" shape="flow">
    <div class="field">
      <span class="lab">{{ t("idgen.kind") }}</span>
      <div class="seg wide">
        <button
          v-for="k in KINDS"
          :key="k.id"
          :class="{ on: kind === k.id }"
          @click="kind = k.id; draw()"
        >
          {{ t(`idgen.${k.id}`) }}
        </button>
      </div>
      <p class="hint">{{ t(`idgen.${KINDS.find((k) => k.id === kind)!.note}`) }}</p>
    </div>

    <div class="row">
      <div class="field narrow">
        <span class="lab">{{ t("idgen.count") }}</span>
        <input v-model.number="count" type="number" min="1" max="1000" class="input mono num" />
      </div>
      <div v-if="kind === 'nano'" class="field narrow">
        <span class="lab">{{ t("idgen.size") }}</span>
        <input v-model.number="size" type="number" min="4" max="128" class="input mono num" />
      </div>
      <button class="btn btn-signal go" @click="draw">
        <Icon name="RefreshCw" /> {{ t("idgen.draw") }}
      </button>
    </div>

    <template #result>
      <div class="res-head">
        <span class="lab">{{ t("idgen.result") }}</span>
        <span class="badge">{{ ids.length }}</span>
        <button class="btn btn-sm btn-quiet" :disabled="!ids.length" @click="copyText(asText, t('common.copied'))">
          <Icon name="Copy" /> {{ t("idgen.copyAll") }}
        </button>
      </div>
      <div class="list scroll-y">
        <button v-for="(v, i) in ids" :key="`${drawn}-${i}`" class="idrow mono" :title="t('idgen.copyOne')" @click="copyOne(v)">
          <span class="idx">{{ i + 1 }}</span>
          <span class="val">{{ v }}</span>
          <Icon name="Copy" class="rowcopy" />
        </button>
      </div>
    </template>

    <template #inspector>
      <InspectorSection v-if="isUuid" :title="t('idgen.format')" icon="Settings2">
        <button class="chip" :class="{ on: compact }" @click="compact = !compact; draw()">
          {{ t("idgen.compact") }}
        </button>
        <button class="chip" :class="{ on: uppercase }" @click="uppercase = !uppercase; draw()">
          {{ t("idgen.uppercase") }}
        </button>
        <p class="hint">{{ t("idgen.formatHint") }}</p>
      </InspectorSection>

      <InspectorSection :title="t('idgen.about')" icon="Info" :open="true">
        <p class="hint">{{ t("idgen.aboutSource") }}</p>
        <p class="hint">{{ t("idgen.aboutSort") }}</p>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
.seg.wide button {
  flex: 1;
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

.res-head .btn {
  margin-left: auto;
}

.list {
  flex: 1;
  padding: 6px 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Each row is its own copy button: the id is the thing you came for. */
.idrow {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 5px 8px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: var(--t-sm);
  color: var(--ink);
}

.idrow:hover {
  background: var(--s-2);
}

.idx {
  min-width: 30px;
  text-align: right;
  color: var(--ink-4);
  font-size: var(--t-xs);
  flex-shrink: 0;
}

.val {
  flex: 1;
  min-width: 0;
  word-break: break-all;
  user-select: text;
}

.rowcopy {
  width: 12px;
  height: 12px;
  color: var(--ink-4);
  opacity: 0;
  flex-shrink: 0;
}

.idrow:hover .rowcopy {
  opacity: 1;
}
</style>
