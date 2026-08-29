<script setup lang="ts">
/**
 * Countdown days: named target dates with their days-remaining. Yearly items
 * roll forward to their next occurrence, one-offs stay put once past.
 * The list persists the same way tabs and snippets do.
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import PanelPage from "../../work/PanelPage.vue";
import Icon from "../../components/Icon.vue";
import { t, lang } from "../../lib/i18n";
import { inWails } from "../../lib/backend";
import * as StoreService from "@bindings/hitool/services/storeservice";
import { nanoId } from "../../lib/ids";
import { daysUntil, parseDate, targetOf, type CountdownItem } from "../../lib/countdown";

const KEY = "countdown.items";

const items = ref<CountdownItem[]>([]);
const name = ref("");
const date = ref(localDate(new Date()));
const yearly = ref(false);

const today = ref(new Date());

function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const rows = computed(() =>
  items.value
    .map((item) => {
      const target = targetOf(item, today.value);
      return {
        item,
        days: daysUntil(item, today.value),
        target: target
          ? new Intl.DateTimeFormat(lang.value === "zh" ? "zh-CN" : "en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
              weekday: "short",
            }).format(target)
          : "",
      };
    })
    // Soonest first; past one-offs sink to the bottom.
    .sort((a, b) => (a.days < 0 ? 1 : b.days < 0 ? -1 : 0) || a.days - b.days),
);

function add() {
  const n = name.value.trim();
  if (!n || !parseDate(date.value)) return;
  items.value.push({ id: nanoId(8), name: n, date: date.value, yearly: yearly.value });
  name.value = "";
  yearly.value = false;
  save();
}

function remove(id: string) {
  items.value = items.value.filter((i) => i.id !== id);
  save();
}

// ---------- persistence ----------

async function load() {
  let raw = "";
  try {
    raw = inWails()
      ? (await StoreService.GetSetting(KEY)) || ""
      : localStorage.getItem(KEY) || "";
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      items.value = parsed.filter(
        (i) => i && typeof i.name === "string" && parseDate(i.date),
      );
    }
  } catch {
    /* a broken store should never block the tool */
  }
}

async function save() {
  const raw = JSON.stringify(items.value);
  try {
    if (inWails()) await StoreService.SetSetting(KEY, raw);
    else localStorage.setItem(KEY, raw);
  } catch {
    /* non-fatal */
  }
}

let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  load();
  // Crossing midnight while the app stays open should flip the counts.
  timer = setInterval(() => (today.value = new Date()), 60_000);
});

onUnmounted(() => clearInterval(timer));
</script>

<template>
  <PanelPage tool-id="countdown">
    <div class="add">
      <input
        v-model="name"
        class="input name"
        :placeholder="t('calc.countdown.namePh')"
        @keydown.enter="add"
      />
      <input v-model="date" type="date" class="input mono" />
      <label class="yearly">
        <input v-model="yearly" type="checkbox" />
        <span>{{ t("calc.countdown.yearly") }}</span>
      </label>
      <button class="btn btn-sm" :disabled="!name.trim() || !parseDate(date)" @click="add">
        <Icon name="Plus" /> {{ t("calc.countdown.add") }}
      </button>
    </div>

    <div v-if="rows.length" class="list">
      <div v-for="row in rows" :key="row.item.id" class="card" :class="{ past: row.days < 0 }">
        <div class="left">
          <span class="nm truncate">{{ row.item.name }}</span>
          <span class="when">{{ row.target }}</span>
          <span v-if="row.item.yearly" class="badge">{{ t("calc.countdown.yearly") }}</span>
        </div>
        <div class="count">
          <template v-if="row.days === 0">
            <span class="big">{{ t("calc.countdown.today") }}</span>
          </template>
          <template v-else-if="row.days > 0">
            <span class="big mono">{{ row.days }}</span>
            <span class="unit">{{ t("calc.countdown.daysLeft") }}</span>
          </template>
          <template v-else>
            <span class="big mono">{{ -row.days }}</span>
            <span class="unit">{{ t("calc.countdown.daysAgo") }}</span>
          </template>
        </div>
        <button class="mini" :title="t('calc.countdown.remove')" @click="remove(row.item.id)">
          <Icon name="X" />
        </button>
      </div>
    </div>
    <p v-else class="hint">{{ t("calc.countdown.empty") }}</p>
  </PanelPage>
</template>

<style scoped>
.add {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.name {
  flex: 1;
  min-width: 160px;
  max-width: 320px;
}

.yearly {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: var(--t-sm);
  color: var(--ink-2);
  cursor: pointer;
  user-select: none;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 640px;
}

.card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-2);
}

.card.past {
  opacity: 0.72;
}

.left {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.nm {
  font-weight: 600;
}

.when {
  font-size: var(--t-xs);
  color: var(--ink-3);
  white-space: nowrap;
}

.count {
  display: flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
}

.big {
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
  color: var(--acc);
}

.card.past .big {
  color: var(--ink-3);
}

.unit {
  font-size: var(--t-xs);
  color: var(--ink-3);
}

.mini {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
  flex-shrink: 0;
}

.mini:hover {
  background: var(--s-3);
  color: var(--fail);
}

.mini :deep(svg) {
  width: 13px;
  height: 13px;
}
</style>
