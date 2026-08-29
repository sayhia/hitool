<script setup lang="ts">
/**
 * The one page that runs every manifest-declared tool. Whatever the tool, the
 * flow is identical: fill the tray, adjust settings, run, watch the output —
 * with the job itself living in the global store so it survives navigation.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import ToolFrame from "./ToolFrame.vue";
import SourceTray from "./SourceTray.vue";
import OutputList from "./OutputList.vue";
import FieldRenderer from "./FieldRenderer.vue";
import Icon from "../components/Icon.vue";
import KbdCombo from "../components/KbdCombo.vue";
import { t } from "../lib/i18n";
import { errText } from "../lib/err";
import { outputDir } from "../lib/backend";
import { manifestFor, defaultValues, type ToolManifest } from "../tools/manifest";
import { addOutput, finishJob, startJob, type Job } from "../stores/jobs";
import * as ImageService from "@bindings/hitool/services/imageservice";
import type { FileInfo } from "@bindings/hitool/services/models";

const route = useRoute();

const manifest = ref<ToolManifest>();
const files = ref<FileInfo[]>([]);
const values = ref<Record<string, any>>({});
const job = ref<Job>();
const busy = ref(false);
const notice = ref("");

const visibleFields = computed(
  () => manifest.value?.fields.filter((f) => !f.when || f.when(values.value)) ?? [],
);

const blockedBy = computed(() => {
  const m = manifest.value;
  if (!m) return "tools.unknown";
  if (files.value.length < m.minFiles) {
    return m.minFiles > 1 ? "bench.needFiles" : "bench.needFile";
  }
  return m.validate?.(values.value);
});

const canRun = computed(() => !busy.value && !blockedBy.value);

/**
 * Runs once per instance: ToolHost keys this component by tool id, so an
 * instance only ever serves one manifest. Nothing is reset here — the refs
 * start empty, and clearing `files` would race the handoff that SourceTray
 * applies from its own (earlier) mount hook.
 */
async function load(id: string) {
  // ToolHost only mounts this for ids it has already resolved in the
  // manifest, so a miss here means a programming error, not a bad URL.
  const m = manifestFor(id);
  if (!m) return;
  manifest.value = m;
  values.value = defaultValues(m);
  values.value.outDir = await outputDir(m.outputBucket);
  const qMode = route.query.mode;
  if (typeof qMode === "string" && m.fields.some((f) => f.key === "mode")) {
    values.value.mode = qMode;
  }
}

async function run() {
  const m = manifest.value;
  if (!m || !canRun.value) return;
  busy.value = true;
  notice.value = "";

  const label = `${t(`tools.${m.id}.name`)} · ${
    files.value.length > 1 ? t("bench.nFiles", { n: files.value.length }) : files.value[0]?.name ?? ""
  }`;

  const j = startJob({
    tool: m.id,
    label,
    total: files.value.length,
    outputDir: values.value.outDir,
    replay: { toolId: m.id, inputs: files.value.map((f) => f.path), params: { ...values.value } },
  });
  job.value = j;

  try {
    const res = await m.run({
      files: files.value,
      v: values.value,
      outDir: values.value.outDir,
    });
    for (const o of res.outputs) addOutput(j, o);
    j.outputDir = res.outputDir || j.outputDir;
    if (res.error && !res.outputs.length) {
      finishJob(j, "failed", res.error);
    } else {
      if (res.error) j.error = res.error;
      finishJob(j, "done");
    }
  } catch (e) {
    finishJob(j, "failed", errText(e));
  } finally {
    busy.value = false;
  }
}

async function cancel() {
  const m = manifest.value;
  if (!m?.cancellable) return;
  if (m.cancellable) await ImageService.Cancel();
  if (job.value?.state === "running") finishJob(job.value, "cancelled");
  busy.value = false;
}

function onRejected(n: number) {
  notice.value = t("bench.rejected", { n });
}

function onKey(e: KeyboardEvent) {
  const meta = e.metaKey || e.ctrlKey;
  if (meta && e.key === "Enter") {
    e.preventDefault();
    run();
  } else if (e.key === "Escape" && busy.value) {
    e.preventDefault();
    cancel();
  }
}

onMounted(() => {
  load(route.params.id as string);
  window.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

</script>

<template>
  <ToolFrame v-if="manifest" shape="batch" :tool-id="manifest.id">
    <template #source>
      <SourceTray
        v-model="files"
        :accept="manifest.accept"
        :filter-name="manifest.filterName"
        :multiple="manifest.multiple"
        :ordered="manifest.ordered"
        :disabled="busy"
        @rejected="onRejected"
      />
      <p v-if="notice" class="banner warn notice">{{ notice }}</p>
    </template>

    <FieldRenderer
      v-for="f in visibleFields"
      :key="f.key"
      v-model="values[f.key]"
      :field="f"
    />

    <template #result>
      <OutputList :job="job" />
    </template>

    <template #run>
      <button class="btn btn-signal run" :disabled="!canRun" @click="run">
        <Icon v-if="busy" name="LoaderCircle" class="spin" />
        <Icon v-else name="Play" />
        {{ busy ? t("common.processing") : t("bench.run") }}
        <KbdCombo v-if="!busy" combo="mod+enter" />
      </button>
      <button v-if="busy && manifest.cancellable" class="btn btn-sm btn-danger" @click="cancel">
        {{ t("common.cancel") }} <kbd>ESC</kbd>
      </button>
      <p v-else-if="blockedBy" class="hint">{{ t(blockedBy) }}</p>
    </template>
  </ToolFrame>
</template>

<style scoped>
.run {
  min-width: 168px;
}

.notice {
  font-size: 11.5px;
  color: var(--ink-2);
}
</style>
