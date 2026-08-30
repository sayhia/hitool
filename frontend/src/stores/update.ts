/**
 * Global update state, shared between the launch-time silent check
 * (AppShell) and the Settings → About panel. Keeping it in a store means a
 * background pre-download started at boot is already "ready" by the time the
 * user opens About — they just click restart.
 */
import { ref } from "vue";
import { checkUpdate, installUpdate, onDownloadProgress, type ReleaseInfo } from "../lib/update";
import * as UpdateService from "@bindings/hitool/services/updateservice";
import * as StoreService from "@bindings/hitool/services/storeservice";
import { inWails } from "../lib/backend";

export type UpdateState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error";

export const updateState = ref<UpdateState>("idle");
export const releaseInfo = ref<ReleaseInfo | null>(null);
export const updateProgress = ref(0); // 0..1
export const updateError = ref("");

/**
 * When the last check actually reached the release feed, so About can say
 * "checked at 14:02" instead of leaving "up to date" undated — the one claim
 * that is worthless without a timestamp. Deliberately not persisted: it
 * describes this session's knowledge, and a day-old answer restored from disk
 * would read as fresh.
 */
export const lastCheckedAt = ref<Date | null>(null);

const SKIPPED_KEY = "update.skippedVersion";
const AUTO_KEY = "update.auto";
let progressOff: (() => void) | null = null;

/**
 * Whether the launch-time probe runs at all. On means what the app did before
 * this switch existed: check on boot, download in the background, offer the
 * restart. Off means nothing reaches the network until the user presses
 * "check for updates" in About.
 */
export const autoUpdate = ref(true);

/**
 * Read the stored preference once, at boot. Only an explicit "0" turns it off:
 * a key that was never written — first launch — and a store that failed to
 * answer must both read as the default, never as "the user said no".
 */
export async function initAutoUpdate(): Promise<void> {
  if (!inWails()) return;
  try {
    autoUpdate.value = (await StoreService.GetSetting(AUTO_KEY)) !== "0";
  } catch {
    /* keep the default */
  }
}

export async function setAutoUpdate(on: boolean): Promise<void> {
  autoUpdate.value = on;
  try {
    if (inWails()) await StoreService.SetSetting(AUTO_KEY, on ? "1" : "0");
  } catch {
    /* persistence is best-effort; the session still honours the choice */
  }
}

async function getSkipped(): Promise<string> {
  try {
    return (await StoreService.GetSetting(SKIPPED_KEY)) || "";
  } catch {
    return "";
  }
}

/** Persistently skip a version so it stops nagging on every launch. */
export async function skipVersion(version: string) {
  try {
    await StoreService.SetSetting(SKIPPED_KEY, version);
  } catch {
    /* store failures shouldn't block the UI */
  }
  updateState.value = "idle";
  releaseInfo.value = null;
}

/** Hide the current update prompt without persisting (re-checks next launch). */
export function dismissUpdate() {
  updateState.value = "idle";
  releaseInfo.value = null;
}

/**
 * Check for a newer release. When autoInstall is true (the launch-time path)
 * and one is found, the download starts immediately in the background so the
 * update is staged by the time the user opens About.
 */
export async function checkForUpdates(autoInstall = false): Promise<void> {
  if (!inWails()) return;
  if (updateState.value === "checking" || updateState.value === "downloading") return;

  updateState.value = "checking";
  updateError.value = "";
  try {
    const info = await checkUpdate();
    lastCheckedAt.value = new Date();
    if (!info.hasNew) {
      updateState.value = "idle";
      releaseInfo.value = null;
      return;
    }
    const skipped = await getSkipped();
    if (skipped === info.latest) {
      updateState.value = "idle";
      releaseInfo.value = null;
      return;
    }
    releaseInfo.value = info;
    updateState.value = "available";
    if (autoInstall) void startInstall();
  } catch (e) {
    updateState.value = "error";
    updateError.value = e instanceof Error ? e.message : String(e);
  }
}

/**
 * The launch-time path. Gated here rather than at the call site so that
 * "automatic updates are off" can only ever mean one thing: nothing reaches
 * the network unless the user asked for it.
 */
export async function autoCheckForUpdates(): Promise<void> {
  if (!autoUpdate.value) return;
  await checkForUpdates(true);
}

/** Download + verify + stage. Subscribes to progress events for the bar. */
export async function startInstall(): Promise<void> {
  if (updateState.value === "downloading" || updateState.value === "ready") return;
  updateState.value = "downloading";
  updateProgress.value = 0;
  progressOff = onDownloadProgress((p) => {
    updateProgress.value = p.total > 0 ? Math.min(1, p.written / p.total) : 0;
  });
  try {
    await installUpdate();
    updateState.value = "ready";
  } catch (e) {
    updateState.value = "error";
    updateError.value = e instanceof Error ? e.message : String(e);
  } finally {
    progressOff?.();
    progressOff = null;
  }
}

/** Swap in the staged binary and relaunch. Does not return — the process exits. */
export async function restartApp(): Promise<void> {
  try {
    await UpdateService.Restart();
  } catch (e) {
    updateError.value = e instanceof Error ? e.message : String(e);
    updateState.value = "error";
  }
}

/** Whether About should show the "check" button vs an in-progress state. */
export function resetUpdate() {
  updateState.value = "idle";
  releaseInfo.value = null;
  updateError.value = "";
  updateProgress.value = 0;
}
