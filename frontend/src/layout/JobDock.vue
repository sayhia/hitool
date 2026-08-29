<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { clearFinished, elapsedText, etaText, useJobs, type Job } from "../stores/jobs";
import { openFolder, revealFile } from "../lib/backend";
import { t } from "../lib/i18n";
import Icon from "../components/Icon.vue";
import KbdCombo from "../components/KbdCombo.vue";

const router = useRouter();
const { recentJobs, runningJobs, dockOpen } = useJobs();

const summary = computed(() => {
  const running = runningJobs.value.length;
  if (running > 0) return { text: t("dock.running", { n: running }), tone: "run" };
  const total = recentJobs.value.length;
  if (total === 0) return { text: t("dock.idle"), tone: "idle" };
  const failed = recentJobs.value.filter((j) => j.state === "failed").length;
  if (failed > 0) return { text: t("dock.someFailed", { n: failed }), tone: "fail" };
  return { text: t("dock.allDone", { n: total }), tone: "ok" };
});

/** Collapsed bar shows the newest running job, or the newest job at all. */
const lead = computed<Job | undefined>(
  () => runningJobs.value[runningJobs.value.length - 1] ?? recentJobs.value[0],
);

function stateClass(j: Job) {
  return j.state === "done" ? "ok" : j.state === "failed" ? "fail" : j.state === "running" ? "run" : "";
}

function progressText(j: Job) {
  if (j.state === "failed") return t("dock.failed");
  if (j.state === "cancelled") return t("dock.cancelled");
  if (j.state === "done") return `${t("dock.done")} · ${elapsedText(j)}`;
  const eta = etaText(j);
  if (j.total > 1) {
    const base = `${j.current}/${j.total} · ${Math.round(j.progress * 100)}%`;
    return eta ? `${base} · ${t("dock.eta", { t: eta })}` : base;
  }
  const pct = `${Math.round(j.progress * 100)}%`;
  return eta ? `${pct} · ${t("dock.eta", { t: eta })}` : pct;
}
</script>

<template>
  <section class="dock" :class="{ open: dockOpen }">
    <button class="dock-bar" @click="dockOpen = !dockOpen">
      <span class="lab">{{ t("dock.title") }}</span>
      <span class="lab tone" :class="summary.tone">{{ summary.text }}</span>

      <template v-if="lead && !dockOpen">
        <span class="lead truncate">{{ lead.label }}</span>
        <span class="track lead-track">
          <span class="fill" :class="stateClass(lead)" :style="{ width: lead.progress * 100 + '%' }" />
        </span>
      </template>

      <span class="lab spacer"><KbdCombo combo="mod+j" /></span>
      <Icon :name="dockOpen ? 'ChevronDown' : 'ChevronUp'" class="chev" />
    </button>

    <div v-if="dockOpen" class="dock-body scroll-y">
      <p v-if="!recentJobs.length" class="hint dock-empty">{{ t("dock.empty") }}</p>

      <div v-for="job in recentJobs" :key="job.id" class="job">
        <span class="job-dot" :class="stateClass(job)" />
        <button class="job-name truncate" @click="router.push(`/t/${job.tool}`)">
          {{ job.label }}
        </button>

        <span class="track job-track">
          <span class="fill" :class="stateClass(job)" :style="{ width: job.progress * 100 + '%' }" />
        </span>

        <span class="lab job-prog">{{ progressText(job) }}</span>

        <button
          v-if="job.outputs.length === 1"
          class="btn btn-sm btn-quiet"
          @click="revealFile(job.outputs[0].path)"
        >
          <Icon name="FolderOpen" />
        </button>
        <button
          v-else-if="job.outputDir && job.state === 'done'"
          class="btn btn-sm btn-quiet"
          @click="openFolder(job.outputDir)"
        >
          <Icon name="FolderOpen" />
        </button>
        <span v-else class="job-pad" />
      </div>
    </div>

    <div v-if="dockOpen && recentJobs.length" class="dock-foot">
      <button class="btn btn-sm btn-quiet" @click="clearFinished">
        <Icon name="Eraser" /> {{ t("dock.clear") }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.dock {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--line-2);
  background: var(--chrome);
  backdrop-filter: blur(var(--chrome-blur)) saturate(1.5);
  -webkit-backdrop-filter: blur(var(--chrome-blur)) saturate(1.5);
  max-height: 46%;
}

.dock-bar {
  display: flex;
  align-items: center;
  gap: 11px;
  height: var(--dock-h);
  flex-shrink: 0;
  padding: 0 14px 0 12px;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--ink);
  width: 100%;
  transition: background 0.16s var(--ease);
}

.dock-bar:hover {
  background: var(--hover);
}

.tone.run {
  color: var(--acc);
}
.tone.ok {
  color: var(--ok);
}
.tone.fail {
  color: var(--fail);
}

.lead {
  font-size: 11.5px;
  color: var(--ink-2);
  max-width: 240px;
}

.lead-track {
  width: 110px;
  flex-shrink: 0;
}

.spacer {
  margin-left: auto;
}

.chev {
  width: 13px;
  height: 13px;
  color: var(--ink-3);
}

.dock-body {
  border-top: 1px solid var(--line-2);
  padding: 7px 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.dock-empty {
  padding: 10px 0;
}

.job {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.job-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--ink-4);
}

.job-dot.run {
  background: var(--acc);
  animation: job-pulse 1.4s var(--ease) infinite;
}
.job-dot.ok {
  background: var(--ok-bright);
}
.job-dot.fail {
  background: var(--fail-bright);
}

@keyframes job-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 var(--acc-wash-2);
  }
  50% {
    box-shadow: 0 0 0 4.5px var(--acc-wash-2);
  }
}

.job-name {
  width: 210px;
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-family: var(--f-ui);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  padding: 0;
}

.job-name:hover {
  color: var(--acc);
}

.job-track {
  flex: 1;
  min-width: 60px;
}

.job-prog {
  width: 118px;
  text-align: right;
  flex-shrink: 0;
  text-transform: none;
  letter-spacing: 0.04em;
}

.job-pad {
  width: 24px;
  flex-shrink: 0;
}

.dock-foot {
  border-top: 1px solid var(--line-2);
  padding: 5px 12px;
  display: flex;
  justify-content: flex-end;
}
</style>
