/**
 * Theme is light-first: light is the designed default, dark is a fully
 * designed second, "auto" follows the OS, and "schedule" switches by the
 * clock — light during the day, dark from the configured hour onward.
 */
import { ref } from "vue";
import * as StoreService from "@bindings/hitool/services/storeservice";
import { inWails } from "./backend";

export type Theme = "light" | "dark" | "auto" | "schedule";

export const theme = ref<Theme>("light");

/** Hour (0–23) when schedule mode flips to dark. Days start light at 07:00. */
export const nightHour = ref(19);

let scheduleTimer: ReturnType<typeof setInterval> | undefined;

export function scheduledTheme(now = new Date()): "light" | "dark" {
  const h = now.getHours();
  return h >= 7 && h < nightHour.value ? "light" : "dark";
}

function apply(t: Theme) {
  const root = document.documentElement;
  if (t === "auto") root.removeAttribute("data-theme");
  else if (t === "schedule") root.setAttribute("data-theme", scheduledTheme());
  else root.setAttribute("data-theme", t);
}

function watchClock(on: boolean) {
  clearInterval(scheduleTimer);
  scheduleTimer = undefined;
  if (!on) return;
  // Re-check every minute; the flip is invisible until the hour changes.
  scheduleTimer = setInterval(() => apply("schedule"), 60_000);
}

export async function setNightHour(h: number) {
  nightHour.value = Math.min(23, Math.max(0, Math.round(h)));
  if (theme.value === "schedule") apply("schedule");
  try {
    if (inWails()) await StoreService.SetSetting("theme.nightHour", String(nightHour.value));
    else localStorage.setItem("theme.nightHour", String(nightHour.value));
  } catch {
    /* persistence is best-effort */
  }
}

export async function setTheme(t: Theme) {
  theme.value = t;
  apply(t);
  watchClock(t === "schedule");
  try {
    if (inWails()) await StoreService.SetSetting("theme", t);
    else localStorage.setItem("theme", t);
  } catch {
    /* persistence is best-effort */
  }
}

/** Rotate light → dark → auto → schedule, for the one-click toggle. */
export function cycleTheme() {
  const order: Theme[] = ["light", "dark", "auto", "schedule"];
  const next = order[(order.indexOf(theme.value) + 1) % order.length];
  return setTheme(next);
}

export async function initTheme() {
  let saved = "";
  let hour = "";
  try {
    if (inWails()) {
      saved = await StoreService.GetSetting("theme");
      hour = await StoreService.GetSetting("theme.nightHour");
    } else {
      saved = localStorage.getItem("theme") || "";
      hour = localStorage.getItem("theme.nightHour") || "";
    }
  } catch {
    /* fall through to default */
  }
  const h = Number(hour);
  if (hour && Number.isFinite(h) && h >= 0 && h <= 23) nightHour.value = h;
  theme.value =
    saved === "dark" || saved === "auto" || saved === "schedule" ? saved : "light";
  apply(theme.value);
  watchClock(theme.value === "schedule");
}
