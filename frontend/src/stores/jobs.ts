/**
 * Job store — jobs live here, not inside the page that started them.
 * Navigating away from a tool no longer loses its progress, and finished
 * jobs stay in the dock so their output can be revealed or re-run.
 */
import { computed, reactive, readonly, ref } from "vue";
import { onConvertProgress } from "../lib/backend";
import { t } from "../lib/i18n";

export type JobState = "running" | "done" | "failed" | "cancelled";

export interface Job {
  id: string;
  tool: string;
  /** Human label, e.g. "PDF 合并 · 3 个文件" */
  label: string;
  state: JobState;
  /** 0–1; stays at the last known value once finished. */
  progress: number;
  current: number;
  total: number;
  /** File currently being worked on, when the backend reports one. */
  activeFile: string;
  outputDir: string;
  outputs: JobOutput[];
  error: string;
  startedAt: number;
  endedAt: number;
  /** Enough state to run this job again with identical settings. */
  replay?: JobReplay;
}

export interface JobOutput {
  path: string;
  name: string;
  /** Free-form detail line, e.g. "88.4 MB → 7.2 MB · −91.9%" */
  detail: string;
  ok: boolean;
}

export interface JobReplay {
  toolId: string;
  inputs: string[];
  params: Record<string, unknown>;
}

const jobs = reactive<Job[]>([]);
/** Which job the progress stream currently belongs to. */
const activeId = ref("");
const dockOpen = ref(false);

let seq = 0;

export const runningJobs = computed(() => jobs.filter((j) => j.state === "running"));
export const hasRunning = computed(() => runningJobs.value.length > 0);

/** Newest first, capped so the dock never grows unbounded. */
export const recentJobs = computed(() => [...jobs].reverse().slice(0, 40));

export function useJobs() {
  return {
    jobs: readonly(jobs) as unknown as Job[],
    recentJobs,
    runningJobs,
    hasRunning,
    dockOpen,
  };
}

export function startJob(init: {
  tool: string;
  label: string;
  total?: number;
  outputDir?: string;
  replay?: JobReplay;
}): Job {
  const job: Job = reactive({
    id: `job-${++seq}`,
    tool: init.tool,
    label: init.label,
    state: "running",
    progress: 0,
    current: 0,
    total: init.total ?? 1,
    activeFile: "",
    outputDir: init.outputDir ?? "",
    outputs: [],
    error: "",
    startedAt: Date.now(),
    endedAt: 0,
    replay: init.replay,
  });
  jobs.push(job);
  // Trim the oldest finished jobs only. Dropping a running one would cut it off
  // from the progress bridge, and the dock would show it frozen forever.
  for (let i = 0; jobs.length > 60 && i < jobs.length; ) {
    if (jobs[i].state === "running") i++;
    else jobs.splice(i, 1);
  }
  activeId.value = job.id;
  return job;
}

/**
 * A finished job deserves a system notification only when the user probably
 * can't see the dock: the window is hidden, or the job ran long enough that
 * they likely switched away. Quick jobs stay silent.
 */
const NOTIFY_AFTER_MS = 5000;

function notifyFinished(job: Job) {
  const slow = job.endedAt - job.startedAt >= NOTIFY_AFTER_MS;
  if (!slow && !document.hidden) return;
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      const title =
        job.state === "done"
          ? t("notify.done", { label: job.label })
          : t("notify.failed", { label: job.label });
      new Notification(title);
    } else if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch {
    // Notifications are best-effort.
  }
}

export function finishJob(job: Job, state: Exclude<JobState, "running">, error = "") {
  job.state = state;
  job.error = error;
  job.endedAt = Date.now();
  if (state === "done") job.progress = 1;
  if (activeId.value === job.id) activeId.value = "";
  if (state === "done" || state === "failed") notifyFinished(job);
}

export function addOutput(job: Job, out: JobOutput) {
  job.outputs.push(out);
}

/** Manual progress for frontend-side work (PDF enhance renders page by page). */
export function setProgress(job: Job, current: number, total: number, activeFile = "") {
  job.current = current;
  job.total = total;
  job.progress = total > 0 ? Math.min(1, current / total) : 0;
  if (activeFile) job.activeFile = activeFile;
}

export function clearFinished() {
  for (let i = jobs.length - 1; i >= 0; i--) {
    if (jobs[i].state !== "running") jobs.splice(i, 1);
  }
}

export function elapsedText(job: Job): string {
  const end = job.endedAt || Date.now();
  const s = Math.max(0, Math.round((end - job.startedAt) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/**
 * Rough time remaining, extrapolated from elapsed work. Empty string until
 * enough progress exists for the estimate to mean anything.
 */
export function etaText(job: Job): string {
  if (job.state !== "running" || job.progress <= 0.02) return "";
  const elapsed = (Date.now() - job.startedAt) / 1000;
  const remain = (elapsed * (1 - job.progress)) / job.progress;
  if (!isFinite(remain) || remain < 1) return "";
  const s = Math.round(remain);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/**
 * Bridge backend batch progress into whichever job is currently active.
 * Registered once for the app lifetime — individual pages no longer
 * subscribe, which is what used to make progress page-local.
 */
export function installProgressBridge() {
  onConvertProgress((p) => {
    const job = jobs.find((j) => j.id === activeId.value);
    if (!job || job.state !== "running") return;
    job.total = p.total || job.total;
    job.activeFile = p.fileName;
    // "converting" means the reported index is in flight, not finished.
    job.current = p.status === "converting" ? p.current - 1 : p.current;
    job.progress = job.total > 0 ? Math.min(1, job.current / job.total) : 0;
  });
}
