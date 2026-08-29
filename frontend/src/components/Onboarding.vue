<script setup lang="ts">
/**
 * First-run tour: four short cards covering the interactions that make the
 * app worth using. Skippable at any step; completion is persisted so it only
 * plays once (Settings > About can replay it).
 */
import { ref } from "vue";
import { t } from "../lib/i18n";
import Icon from "./Icon.vue";
import { markOnboardingDone } from "../lib/onboarding";

const emit = defineEmits<{ done: [] }>();
const step = ref(0);

const STEPS = [
  { icon: "Sparkles", title: "onb.s1Title", body: "onb.s1Body" },
  { icon: "FolderInput", title: "onb.s2Title", body: "onb.s2Body" },
  { icon: "Command", title: "onb.s3Title", body: "onb.s3Body" },
  { icon: "Star", title: "onb.s4Title", body: "onb.s4Body" },
];

async function finish() {
  await markOnboardingDone();
  emit("done");
}

function next() {
  if (step.value >= STEPS.length - 1) return void finish();
  step.value++;
}
</script>

<template>
  <div class="onb-veil" role="dialog" aria-modal="true">
    <div class="onb-card">
      <img v-if="step === 0" class="onb-logo" src="/hitool.png" alt="" width="52" height="52" />
      <div v-else class="onb-icon">
        <Icon :name="STEPS[step].icon" />
      </div>
      <h1>{{ t(STEPS[step].title) }}</h1>
      <p class="hint">{{ t(STEPS[step].body) }}</p>

      <div class="onb-dots" aria-hidden="true">
        <span
          v-for="(s, i) in STEPS"
          :key="s.title"
          class="dot"
          :class="{ on: i === step }"
        />
      </div>

      <footer class="onb-foot">
        <button class="btn" @click="finish()">{{ t("onb.skip") }}</button>
        <div class="spacer" />
        <button v-if="step > 0" class="btn" @click="step--">
          {{ t("onb.prev") }}
        </button>
        <button class="btn btn-primary" @click="next()">
          {{ step === STEPS.length - 1 ? t("onb.start") : t("onb.next") }}
        </button>
      </footer>
      <span class="sr-only" role="status">{{ step + 1 }} / {{ STEPS.length }}</span>
    </div>
  </div>
</template>

<style scoped>
.onb-veil {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: color-mix(in srgb, var(--ink) 18%, transparent);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.onb-card {
  width: min(440px, calc(100vw - 48px));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 30px 32px 20px;
  background: var(--s-1);
  border: 1px solid var(--line-2);
  border-radius: var(--r-xl);
  box-shadow: var(--e-3);
  text-align: center;
}

.onb-logo {
  width: 52px;
  height: 52px;
  border-radius: var(--r);
  display: block;
}

.onb-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r);
  background: var(--acc-wash);
  color: var(--acc);
}

.onb-icon :deep(svg) {
  width: 26px;
  height: 26px;
}

.onb-card h1 {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.onb-card .hint {
  max-width: 40ch;
}

.onb-dots {
  display: flex;
  gap: 6px;
  margin: 6px 0 4px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--line-strong);
  transition: background 0.18s var(--ease-out), transform 0.18s var(--ease-out);
}

.dot.on {
  background: var(--acc);
  transform: scale(1.2);
}

.onb-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
}

.spacer {
  flex: 1;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
