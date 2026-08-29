<script setup lang="ts">
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { lorem } from "../../lib/lorem";

const lang = ref<"la" | "zh">("la");
const paragraphs = ref(3);
const sentences = ref(4);
const seed = ref(1);
const text = computed(() =>
  lorem({ lang: lang.value, paragraphs: paragraphs.value, sentences: sentences.value, seed: seed.value }),
);

function redraw() {
  seed.value = (seed.value + 1) % 1_000_000 || 1;
}
</script>

<template>
  <ToolFrame tool-id="lorem" shape="single">
    <div class="row">
      <div class="field">
        <span class="lab">{{ t("lorem.lang") }}</span>
        <div class="seg">
          <button :class="{ on: lang === 'la' }" @click="lang = 'la'">Latin</button>
          <button :class="{ on: lang === 'zh' }" @click="lang = 'zh'">中文</button>
        </div>
      </div>
      <div class="field narrow">
        <span class="lab">{{ t("lorem.paragraphs") }}</span>
        <input v-model.number="paragraphs" class="input mono" type="number" min="1" max="30" />
      </div>
      <div class="field narrow">
        <span class="lab">{{ t("lorem.sentences") }}</span>
        <input v-model.number="sentences" class="input mono" type="number" min="1" max="12" />
      </div>
      <button class="btn" @click="redraw">
        <Icon name="RefreshCw" /> {{ t("lorem.redraw") }}
      </button>
    </div>
    <div class="field grow-field">
      <div class="head">
        <span class="lab">{{ t("lorem.output") }}</span>
        <button class="btn btn-sm" @click="copyText(text, t('common.copied'))">
          <Icon name="Copy" /> {{ t("common.copy") }}
        </button>
      </div>
      <textarea class="textarea grow" :value="text" readonly />
    </div>
  </ToolFrame>
</template>

<style scoped>
.row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.narrow { width: 96px; }
.head { display: flex; align-items: center; gap: 8px; }
.head .lab { flex: 1; }
.grow-field { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
.grow { flex: 1; min-height: 220px; }
</style>
