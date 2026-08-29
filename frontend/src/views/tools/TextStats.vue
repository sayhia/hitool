<script setup lang="ts">
import { computed, ref } from "vue";
import PanelPage from "../../work/PanelPage.vue";
import { t } from "../../lib/i18n";
import { speakTime } from "../../lib/speakTime";

const text = ref("");

const stats = computed(() => {
  const v = text.value;
  const chars = [...v].length;
  const charsNoSpace = [...v.replace(/\s/g, "")].length;
  const cjk = (v.match(/[一-鿿぀-ヿ가-힯]/g) || []).length;
  const latinWords = (v.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || []).length;
  return {
    chars,
    charsNoSpace,
    words: latinWords + cjk,
    cjk,
    lines: v ? v.split(/\r?\n/).length : 0,
    paragraphs: v.trim() ? v.trim().split(/(?:\r?\n){2,}/).length : 0,
  };
});

const tiles = computed(() => {
  const s = stats.value;
  const est = speakTime(text.value);
  const mins = (n: number) =>
    n > 0 ? t("text.stats.duration", { n: n.toLocaleString() }) : t("text.stats.none");
  return [
    { key: "chars", value: s.chars.toLocaleString() },
    { key: "charsNoSpace", value: s.charsNoSpace.toLocaleString() },
    { key: "words", value: s.words.toLocaleString() },
    { key: "cjk", value: s.cjk.toLocaleString() },
    { key: "lines", value: s.lines.toLocaleString() },
    { key: "paragraphs", value: s.paragraphs.toLocaleString() },
    { key: "readMin", value: mins(est.readMinutes) },
    { key: "speakMin", value: mins(est.speakMinutes) },
  ];
});
</script>

<template>
  <PanelPage tool-id="text-stats">
    <div class="readout">
      <div v-for="tile in tiles" :key="tile.key" class="cell">
        <span class="value mono">{{ tile.value }}</span>
        <span class="lab">{{ t(`text.stats.${tile.key}`) }}</span>
      </div>
    </div>

    <div class="field">
      <span class="lab">{{ t("text.input") }}</span>
      <textarea
        v-model="text"
        class="textarea"
        :placeholder="t('text.placeholder')"
        rows="12"
        spellcheck="false"
      ></textarea>
    </div>
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
</style>
