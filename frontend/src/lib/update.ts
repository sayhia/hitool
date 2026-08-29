/**
 * Update checking against the project's GitHub releases, driven by the Wails
 * v3 updater (app.Updater) exposed through services.UpdateService.
 *
 * The Go side owns the network call (GitHub provider), semver comparison and
 * the binary download/swap; this module is the thin frontend wrapper plus the
 * pure version maths kept here so it stays unit-testable.
 */
import { Events } from "@wailsio/runtime";
import * as UpdateService from "@bindings/hitool/services/updateservice";

/** Strip a leading "v" and trailing build metadata ("1.2.3+abc" → "1.2.3"). */
export function normalizeVersion(s: string): string {
  return s.trim().replace(/^v/i, "").split("+")[0] || "0.0.0";
}

/**
 * Semver-ish comparison: numeric segments compared left to right, a
 * prerelease suffix sorts below the same version without one.
 * Returns <0 when a<b, 0 when equal, >0 when a>b.
 */
export function compareVersions(a: string, b: string): number {
  const [ca, pa] = split(normalizeVersion(a));
  const [cb, pb] = split(normalizeVersion(b));
  const n = Math.max(ca.length, cb.length);
  for (let i = 0; i < n; i++) {
    const d = (ca[i] ?? 0) - (cb[i] ?? 0);
    if (d) return d;
  }
  // Same numeric core: "1.0.0-beta" < "1.0.0".
  if (pa && !pb) return -1;
  if (!pa && pb) return 1;
  return pa < pb ? -1 : pa > pb ? 1 : 0;
}

function split(v: string): [number[], string] {
  const dash = v.indexOf("-");
  const core = dash >= 0 ? v.slice(0, dash) : v;
  const pre = dash >= 0 ? v.slice(dash + 1) : "";
  const nums = core
    .split(".")
    .map((p) => (/^\d+$/.test(p) ? Number(p) : 0));
  return [nums, pre];
}

export interface ReleaseInfo {
  /** Latest published version without the leading "v". */
  latest: string;
  /** Page to download / read the changelog. */
  url: string;
  /** Release notes body, may be empty. */
  notes: string;
  /** True when the remote version is strictly newer than the running one. */
  hasNew: boolean;
}

/**
 * Ask the Wails updater to check the configured GitHub releases for a newer
 * build. Throws a plain Error with an i18n key as message when the updater
 * is unconfigured or the check fails — callers surface it via the toast.
 */
export async function checkUpdate(): Promise<ReleaseInfo> {
  const r = await UpdateService.Check();
  if (!r) throw new Error("update.errApi");
  return {
    latest: r.latestVersion || "",
    url: r.releaseUrl || "",
    notes: r.notes || "",
    hasNew: r.hasUpdate,
  };
}

/** Download, verify and stage the update selected by a previous check. */
export async function installUpdate(): Promise<void> {
  await UpdateService.DownloadAndInstall();
}

export interface DownloadProgress {
  written: number;
  total: number;
}

/**
 * Subscribe to download progress events from the updater. Returns a cancel
 * function that removes the listener.
 */
export function onDownloadProgress(cb: (p: DownloadProgress) => void): () => void {
  // Wails v3 delivers event payloads as `{ data: [...] }` — the Progress
  // object is the first element of `data`, not the callback argument itself.
  const off = Events.On("wails:updater:download-progress", (ev: unknown) => {
    const e = ev as { data?: unknown } | undefined;
    const d = (Array.isArray(e?.data) ? e!.data[0] : e?.data) as DownloadProgress | undefined;
    if (d && typeof d.written === "number" && typeof d.total === "number") cb(d);
  });
  return () => {
    if (typeof off === "function") off();
  };
}
