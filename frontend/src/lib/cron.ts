/**
 * Six-field Quartz cron: build, parse back, and preview upcoming runs.
 * Fields are `second minute hour day-of-month month day-of-week`.
 * Weekday numbering follows Quartz (1 = Sunday … 7 = Saturday).
 */

export type FieldId = "second" | "minute" | "hour" | "day" | "month" | "week";
export type Mode = "every" | "unset" | "range" | "step" | "list";

export interface FieldSpec {
  mode: Mode;
  rangeFrom: number;
  rangeTo: number;
  stepFrom: number;
  stepEvery: number;
  list: number[];
}

export interface FieldMeta {
  id: FieldId;
  min: number;
  max: number;
  /** Only day-of-month and day-of-week may be "?" in Quartz. */
  canUnset: boolean;
}

export const FIELDS: FieldMeta[] = [
  { id: "second", min: 0, max: 59, canUnset: false },
  { id: "minute", min: 0, max: 59, canUnset: false },
  { id: "hour", min: 0, max: 23, canUnset: false },
  { id: "day", min: 1, max: 31, canUnset: true },
  { id: "month", min: 1, max: 12, canUnset: false },
  { id: "week", min: 1, max: 7, canUnset: true },
];

export const ORDER: FieldId[] = ["second", "minute", "hour", "day", "month", "week"];

export function defaultSpec(meta: FieldMeta, mode: Mode = "every"): FieldSpec {
  return {
    mode,
    rangeFrom: meta.min,
    rangeTo: meta.max,
    stepFrom: meta.min,
    stepEvery: 1,
    list: [meta.min],
  };
}

export function defaultConfig(): Record<FieldId, FieldSpec> {
  const cfg = {} as Record<FieldId, FieldSpec>;
  for (const meta of FIELDS) {
    // A bare "* * * * * ?" fires every second, so start from a saner default:
    // every minute, with day-of-week unset.
    cfg[meta.id] = defaultSpec(meta, meta.id === "week" ? "unset" : "every");
  }
  cfg.second = defaultSpec(FIELDS[0], "list");
  cfg.second.list = [0];
  return cfg;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Render one field of the expression. */
export function fieldToText(id: FieldId, spec: FieldSpec): string {
  const meta = FIELDS.find((f) => f.id === id)!;
  switch (spec.mode) {
    case "unset":
      return meta.canUnset ? "?" : "*";
    case "range": {
      const a = clamp(spec.rangeFrom, meta.min, meta.max);
      const b = clamp(spec.rangeTo, meta.min, meta.max);
      return a <= b ? `${a}-${b}` : `${b}-${a}`;
    }
    case "step": {
      const a = clamp(spec.stepFrom, meta.min, meta.max);
      const n = Math.max(1, Math.floor(spec.stepEvery) || 1);
      return `${a}/${n}`;
    }
    case "list": {
      const vals = [...new Set(spec.list)]
        .filter((v) => v >= meta.min && v <= meta.max)
        .sort((a, b) => a - b);
      return vals.length ? vals.join(",") : "*";
    }
    default:
      return "*";
  }
}

export function buildExpression(cfg: Record<FieldId, FieldSpec>): string {
  return ORDER.map((id) => fieldToText(id, cfg[id])).join(" ");
}

/** Parse one field back into a spec; returns null when unrecognised. */
export function parseField(id: FieldId, raw: string): FieldSpec | null {
  const meta = FIELDS.find((f) => f.id === id)!;
  const text = raw.trim();
  if (!text) return null;

  if (text === "*") return defaultSpec(meta, "every");
  if (text === "?") return defaultSpec(meta, meta.canUnset ? "unset" : "every");

  // a/n  or  */n
  const step = /^(\*|\d+)\/(\d+)$/.exec(text);
  if (step) {
    const s = defaultSpec(meta, "step");
    s.stepFrom = step[1] === "*" ? meta.min : clamp(Number(step[1]), meta.min, meta.max);
    s.stepEvery = Math.max(1, Number(step[2]));
    return s;
  }

  // a-b
  const range = /^(\d+)-(\d+)$/.exec(text);
  if (range) {
    const s = defaultSpec(meta, "range");
    s.rangeFrom = clamp(Number(range[1]), meta.min, meta.max);
    s.rangeTo = clamp(Number(range[2]), meta.min, meta.max);
    return s;
  }

  // a,b,c  (or a single value)
  if (/^\d+(,\d+)*$/.test(text)) {
    const s = defaultSpec(meta, "list");
    s.list = [...new Set(text.split(",").map(Number))]
      .filter((v) => v >= meta.min && v <= meta.max)
      .sort((a, b) => a - b);
    return s.list.length ? s : null;
  }

  return null;
}

export function parseExpression(expr: string): Record<FieldId, FieldSpec> | null {
  const parts = expr.trim().split(/\s+/);
  // Accept 5-field (no seconds) by prepending a 0-second field.
  if (parts.length === 5) parts.unshift("0");
  if (parts.length !== 6) return null;

  const cfg = {} as Record<FieldId, FieldSpec>;
  for (let i = 0; i < ORDER.length; i++) {
    const spec = parseField(ORDER[i], parts[i]);
    if (!spec) return null;
    cfg[ORDER[i]] = spec;
  }
  return cfg;
}

/** All values a field can fire on, ascending. */
export function expand(id: FieldId, spec: FieldSpec): number[] {
  const meta = FIELDS.find((f) => f.id === id)!;
  const all: number[] = [];
  switch (spec.mode) {
    case "every":
    case "unset":
      for (let v = meta.min; v <= meta.max; v++) all.push(v);
      return all;
    case "range": {
      const a = Math.min(spec.rangeFrom, spec.rangeTo);
      const b = Math.max(spec.rangeFrom, spec.rangeTo);
      for (let v = clamp(a, meta.min, meta.max); v <= clamp(b, meta.min, meta.max); v++) all.push(v);
      return all;
    }
    case "step": {
      const n = Math.max(1, Math.floor(spec.stepEvery) || 1);
      for (let v = clamp(spec.stepFrom, meta.min, meta.max); v <= meta.max; v += n) all.push(v);
      return all;
    }
    case "list":
      return [...new Set(spec.list)]
        .filter((v) => v >= meta.min && v <= meta.max)
        .sort((a, b) => a - b);
  }
}

/**
 * True when neither day field is `?`, which the three cron dialects read three
 * different ways: Quartz refuses the expression outright, Unix cron takes the
 * union, and this tool takes the intersection. Same six tokens, wildly
 * different answers — `0 0 0 15 * 2` is "every 15th or every Monday" to cron
 * and "the 15th when it falls on a Monday" here — so the UI has to say which.
 */
export function daysConflict(cfg: Record<FieldId, FieldSpec>): boolean {
  return cfg.day.mode !== "unset" && cfg.week.mode !== "unset";
}

/**
 * Upcoming fire times. Walks day by day (bounded to ~4 years) and only
 * enumerates times inside a matching day, so sparse schedules stay fast.
 */
export function nextRuns(
  cfg: Record<FieldId, FieldSpec>,
  count = 5,
  from: Date = new Date(),
): Date[] {
  const seconds = expand("second", cfg.second);
  const minutes = expand("minute", cfg.minute);
  const hours = expand("hour", cfg.hour);
  const months = expand("month", cfg.month);
  const doms = expand("day", cfg.day);
  const dows = expand("week", cfg.week);

  if (!seconds.length || !minutes.length || !hours.length || !months.length) return [];

  const domUnset = cfg.day.mode === "unset";
  const dowUnset = cfg.week.mode === "unset";
  if (!domUnset && !doms.length) return [];
  if (!dowUnset && !dows.length) return [];

  const monthSet = new Set(months);
  const domSet = new Set(doms);
  const dowSet = new Set(dows);

  const out: Date[] = [];
  const start = new Date(from.getTime() + 1000);
  start.setMilliseconds(0);

  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  for (let day = 0; day < 1500 && out.length < count; day++) {
    if (day > 0) cursor.setDate(cursor.getDate() + 1);

    if (!monthSet.has(cursor.getMonth() + 1)) continue;
    // Quartz weekday: 1 = Sunday.
    const dowMatch = dowUnset || dowSet.has(cursor.getDay() + 1);
    const domMatch = domUnset || domSet.has(cursor.getDate());
    if (!domMatch || !dowMatch) continue;

    for (const h of hours) {
      for (const mi of minutes) {
        for (const s of seconds) {
          const t = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), h, mi, s);
          if (t < start) continue;
          // A local time the clock skipped over — the hour a DST jump ate —
          // comes back from `Date` as the next instant that does exist, so
          // "02:30 daily" would preview as 03:30 on that one day. Showing a
          // time that contradicts the expression is worse than showing that
          // the day has no such moment, which is the truth.
          if (t.getHours() !== h || t.getMinutes() !== mi || t.getSeconds() !== s) continue;
          out.push(t);
          if (out.length >= count) return out;
        }
      }
    }
  }
  return out;
}

export const PRESETS: { key: string; expr: string }[] = [
  { key: "presetEveryMinute", expr: "0 * * * * ?" },
  { key: "presetHourly", expr: "0 0 * * * ?" },
  { key: "presetDaily", expr: "0 0 0 * * ?" },
  { key: "presetWorkday", expr: "0 0 9 ? * 2-6" },
  { key: "presetMonthly", expr: "0 0 0 1 * ?" },
];

export function formatRun(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
