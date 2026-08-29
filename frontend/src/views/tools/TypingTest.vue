<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import PanelPage from "../../work/PanelPage.vue";
import { t } from "../../lib/i18n";

const WORDS = (
  "the quick brown fox jumps over lazy dog time work life world hand part child eye woman place week " +
  "case point company number group problem fact money story month right study book job word business " +
  "issue side kind head house service friend father power hour game line end member law car city name " +
  "team minute idea body back parent face level office door health person art war history result change " +
  "morning reason research girl guy moment air teacher force education foot boy age policy process music " +
  "market sense nation plan college interest death experience effect use class control care field development " +
  "role effort rate heart drug show leader light voice wife whole police mind price report decision son view " +
  "relationship town road arm difference value building action model season society tax director early position " +
  "player record paper space ground form event official matter center couple site project activity star table " +
  "need court american oil situation cost industry figure street image phone data question rest movie north"
).split(/\s+/);

const DURATION = 60;

const running = ref(false);
const finished = ref(false);
const timeLeft = ref(DURATION);
const words = ref<string[]>([]);
const wordIdx = ref(0);
const current = ref("");
const correct = ref(0);
const wrong = ref(0);
const typedChars = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

function shuffle(): string[] {
  const arr = [...WORDS];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function start() {
  words.value = shuffle();
  wordIdx.value = 0;
  current.value = "";
  correct.value = 0;
  wrong.value = 0;
  typedChars.value = 0;
  timeLeft.value = DURATION;
  running.value = true;
  finished.value = false;
  timer = setInterval(() => {
    timeLeft.value--;
    if (timeLeft.value <= 0) finish();
  }, 1000);
  requestAnimationFrame(() => inputEl.value?.focus());
}

function finish() {
  running.value = false;
  finished.value = true;
  if (timer) clearInterval(timer);
  timer = null;
}

function onInput() {
  if (!running.value) return;
  const v = current.value;
  if (v.endsWith(" ")) {
    const typed = v.trim();
    if (typed) {
      typedChars.value += typed.length + 1;
      if (typed === words.value[wordIdx.value]) correct.value++;
      else wrong.value++;
      wordIdx.value++;
    }
    current.value = "";
  }
}

const wpm = computed(() => {
  const elapsed = DURATION - timeLeft.value;
  if (elapsed <= 0) return 0;
  return Math.round((correct.value / elapsed) * 60);
});

const accuracy = computed(() => {
  const total = correct.value + wrong.value;
  return total ? Math.round((correct.value / total) * 100) : 100;
});

const visible = computed(() => words.value.slice(wordIdx.value, wordIdx.value + 18));

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <PanelPage tool-id="typing-test">
    <div class="readout">
      <div class="cell">
        <span class="value mono">{{ timeLeft }}<span class="unit">s</span></span>
        <span class="lab">{{ t("typing.timeLeft") }}</span>
      </div>
      <div class="cell">
        <span class="value mono">{{ wpm }}</span>
        <span class="lab">{{ t("typing.wpm") }}</span>
      </div>
      <div class="cell">
        <span class="value mono">{{ accuracy }}<span class="unit">%</span></span>
        <span class="lab">{{ t("typing.accuracy") }}</span>
      </div>
      <div class="cell">
        <span class="value mono">{{ correct + wrong }}</span>
        <span class="lab">{{ t("typing.typed") }}</span>
      </div>
    </div>

    <div class="track">
      <div class="fill" :style="{ width: (timeLeft / DURATION) * 100 + '%' }"></div>
    </div>

    <div v-if="finished" class="stripe ok">
      {{ t("typing.finish") }}
      <span class="mono">{{ wpm }} WPM · {{ accuracy }}%</span>
    </div>

    <div v-if="running" class="words mono">
      <span
        v-for="(w, i) in visible"
        :key="wordIdx + '-' + i"
        class="w"
        :class="{ cur: i === 0 }"
        >{{ w }}</span
      >
    </div>

    <div class="ctl">
      <input
        v-if="running"
        ref="inputEl"
        v-model="current"
        class="input mono type-in"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        @input="onInput"
      />
      <button class="btn btn-signal" @click="start">
        {{ running || finished ? t("typing.restart") : t("typing.start") }}
      </button>
    </div>

    <p class="hint">{{ t("typing.hint") }}</p>
  </PanelPage>
</template>

<style scoped>
/* Readout panel: one hairline-ruled block, like a meter cluster. */
.readout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
}

.cell {
  background: var(--s-2);
  padding: 11px 13px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.value {
  font-size: 21px;
  font-weight: 600;
  line-height: 1.2;
}

.unit {
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-3);
}

/* Word tape: fixed-pitch so the line doesn't shuffle as words are consumed.
   The leading word is the active target, hence the signal underline. */
.words {
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-2);
  padding: 12px 13px;
  font-size: 16px;
  line-height: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 0 4px;
}

.w {
  padding: 1px 5px;
  border-radius: var(--r);
  border-bottom: 2px solid transparent;
  color: var(--ink-3);
}

.w.cur {
  background: var(--acc-wash);
  border-bottom-color: var(--acc);
  color: var(--ink);
  font-weight: 600;
}

.ctl {
  display: flex;
  align-items: center;
  gap: 8px;
}

.type-in {
  flex: 1;
  min-width: 0;
  height: 36px;
  font-size: 15px;
}
</style>
