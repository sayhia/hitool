<script setup lang="ts">
/**
 * SemVer comparison and range checking: which version is newer, and does a
 * version live inside a dependency range (^, ~, >=, spaces AND, || OR).
 */
import { computed, ref } from "vue";
import ToolFrame from "../../work/ToolFrame.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { compareSemVer, parseSemVer, satisfies } from "../../lib/semver";

const a = ref("1.4.2");
const b = ref("2.0.0");
const version = ref("1.4.2");
const range = ref("^1.2.0");

const comparison = computed(() => {
  const va = parseSemVer(a.value);
  const vb = parseSemVer(b.value);
  if (!va || !vb) return { state: "invalid" as const, text: "" };
  const c = compareSemVer(va, vb);
  return { state: "ok" as const, text: c < 0 ? "<" : c > 0 ? ">" : "=" };
});

const rangeResult = computed(() => {
  const res = satisfies(version.value, range.value);
  if (res === null) return { state: "invalid" as const, label: "" };
  return { state: res ? "yes" : "no", label: "" };
});
</script>

<template>
  <ToolFrame tool-id="semver-calc" shape="flow">
    <div class="field">
      <span class="lab">{{ t("semver.compare") }}</span>
      <div class="cmp">
        <input v-model="a" class="input mono" spellcheck="false" placeholder="1.4.2" />
        <span class="cmp-op mono" :class="comparison.state">
          <template v-if="comparison.state === 'ok'">{{ comparison.text }}</template>
          <Icon v-else name="CircleAlert" />
        </span>
        <input v-model="b" class="input mono" spellcheck="false" placeholder="2.0.0" />
      </div>
    </div>

    <div class="field">
      <span class="lab">{{ t("semver.rangeCheck") }}</span>
      <div class="range">
        <input v-model="version" class="input mono" spellcheck="false" placeholder="1.4.2" />
        <span class="lab">{{ t("semver.inRange") }}</span>
        <input v-model="range" class="input mono grow" spellcheck="false" placeholder="^1.2.0" />
        <span v-if="rangeResult.state !== 'invalid'" class="badge" :class="rangeResult.state === 'yes' ? 'ok' : 'fail'">
          {{ rangeResult.state === "yes" ? t("semver.yes") : t("semver.no") }}
        </span>
      </div>
      <p class="hint">{{ t("semver.hint") }}</p>
    </div>

    <template #inspector>
      <p class="hint">{{ t("semver.about") }}</p>
    </template>
  </ToolFrame>
</template>

<style scoped>
.cmp {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cmp .input {
  flex: 1;
}

.cmp-op {
  min-width: 26px;
  text-align: center;
  font-size: var(--t-lg);
  color: var(--acc);
}

.cmp-op.invalid {
  color: var(--fail);
}

.cmp-op :deep(svg) {
  width: 15px;
  height: 15px;
}

.range {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.range .input {
  width: 130px;
}

.range .grow {
  flex: 1;
  min-width: 150px;
  width: auto;
}
</style>
