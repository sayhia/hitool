<script setup lang="ts">
import { computed, ref } from "vue";
import PanelPage from "../../work/PanelPage.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { parsePool, pickWinners } from "../../lib/raffle";

const text = ref("");
const count = ref(1);
const unique = ref(true);

const pool = computed(() => parsePool(text.value));
const tickets = computed(() => (unique.value ? new Set(pool.value).size : pool.value.length));

const winners = ref<string[]>([]);
const rounds = ref<{ names: string[] }[]>([]);

function draw() {
  if (!pool.value.length) return;
  const picked = pickWinners(pool.value, count.value || 1, { unique: unique.value });
  winners.value = picked;
  rounds.value = [{ names: picked }, ...rounds.value].slice(0, 5);
}

function clearRounds() {
  rounds.value = [];
}
</script>

<template>
  <PanelPage tool-id="raffle">
    <div class="field">
      <span class="lab">{{ t("raffle.pool") }}</span>
      <textarea
        v-model="text"
        class="textarea"
        :placeholder="t('raffle.poolPh')"
        rows="7"
        spellcheck="false"
      ></textarea>
      <span class="hint">{{ t("raffle.poolCount", { n: tickets }) }}</span>
    </div>

    <div class="row">
      <label class="field count">
        <span class="lab">{{ t("raffle.count") }}</span>
        <input v-model.number="count" type="number" min="1" class="input mono" />
      </label>
      <label class="switchline">
        <input v-model="unique" type="checkbox" />
        <span>{{ t("raffle.unique") }}</span>
      </label>
      <button class="btn run" :disabled="!pool.length" @click="draw">
        <Icon name="Dices" /> {{ t("raffle.draw") }}
      </button>
    </div>

    <template v-if="winners.length">
      <div class="result">
        <span v-for="(w, i) in winners" :key="i" class="winner">{{ w }}</span>
      </div>
    </template>

    <template v-if="rounds.length">
      <div class="hist-head">
        <span class="lab">{{ t("raffle.history") }}</span>
        <button class="btn btn-sm btn-quiet" @click="clearRounds">
          {{ t("common.clear") }}
        </button>
      </div>
      <div v-for="(r, i) in rounds" :key="i" class="round mono truncate">
        {{ i + 1 }}. {{ r.names.join(" · ") }}
      </div>
    </template>
  </PanelPage>
</template>

<style scoped>
.row {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
}

.count {
  width: 110px;
}

.switchline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--t-sm);
  color: var(--ink-2);
  cursor: pointer;
  user-select: none;
  padding-bottom: 8px;
}

.run {
  min-width: 140px;
}

.result {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.winner {
  padding: 7px 14px;
  border-radius: var(--r);
  background: var(--acc-wash);
  border: 1px solid var(--acc);
  color: var(--acc);
  font-weight: 600;
  font-size: var(--t-base);
}

.hist-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.round {
  font-size: var(--t-xs);
  color: var(--ink-3);
}
</style>
