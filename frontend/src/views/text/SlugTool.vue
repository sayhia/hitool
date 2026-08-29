<script setup lang="ts">
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { sanitizeFilename, slugify } from "../../lib/slugify";

const src = ref("");
const sep = ref("-");
const lower = ref(true);
const max = ref(80);
const slug = computed(() => slugify(src.value, { sep: sep.value, lower: lower.value, max: max.value }));
const file = computed(() => sanitizeFilename(src.value));
</script>

<template>
  <ToolFrame tool-id="slug-tool" shape="flow">
    <div class="field grow-field">
      <span class="lab">{{ t("slug.input") }}</span>
      <textarea
        v-model="src"
        class="textarea grow"
        :placeholder="t('slug.inputPh')"
        spellcheck="false"
      />
      <div class="opts">
        <label class="chk"><input v-model="lower" type="checkbox" /> {{ t("slug.lower") }}</label>
        <div class="seg">
          <button :class="{ on: sep === '-' }" @click="sep = '-'">-</button>
          <button :class="{ on: sep === '_' }" @click="sep = '_'">_</button>
        </div>
        <label class="max">
          {{ t("slug.max") }}
          <input v-model.number="max" class="input mono" type="number" min="8" max="200" />
        </label>
      </div>
    </div>
    <template #result>
      <div class="res">
        <div class="block">
          <span class="lab">{{ t("slug.slug") }}</span>
          <code class="mono val">{{ slug || "—" }}</code>
          <button class="btn" :disabled="!slug" @click="copyText(slug, t('common.copied'))">
            <Icon name="Copy" /> {{ t("common.copy") }}
          </button>
        </div>
        <div class="block">
          <span class="lab">{{ t("slug.file") }}</span>
          <code class="mono val">{{ src ? file : "—" }}</code>
          <button class="btn" :disabled="!src" @click="copyText(file, t('common.copied'))">
            <Icon name="Copy" /> {{ t("common.copy") }}
          </button>
        </div>
      </div>
    </template>
  </ToolFrame>
</template>

<style scoped>
.grow-field { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.grow { flex: 1; min-height: 140px; }
.opts { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.chk { display: flex; align-items: center; gap: 6px; font-size: var(--t-sm); }
.max { display: flex; align-items: center; gap: 6px; font-size: var(--t-sm); color: var(--ink-2); }
.max .input { width: 72px; }
.res { display: flex; flex-direction: column; gap: 16px; padding: 18px; }
.block { display: flex; flex-direction: column; gap: 8px; }
.val {
  padding: 12px; border-radius: var(--r-sm); background: var(--s-2);
  word-break: break-all; font-size: var(--t-md);
}
</style>
