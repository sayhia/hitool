/**
 * Calendar arithmetic: the gap between two dates and shifting a date by a
 * number of days or months. Everything works on calendar dates (local
 * midnight) and compares through UTC, so DST transitions never make a day
 * count come out as 0.9999 of a day.
 */

/** Parse a strict `YYYY-MM-DD` string; rejects rollover dates like 2023-02-31. */
export function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function formatYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Signed day count from `a` to `b` (b − a), DST-proof via UTC comparison. */
export function diffDays(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

export function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}

/**
 * Weekdays (Mon–Fri) in the half-open interval [a, b) — consistent with
 * diffDays, so a Monday-to-Friday span reports 4 working days elapsed.
 * Negative when b is before a.
 */
export function workdays(a: Date, b: Date): number {
  const n = diffDays(a, b);
  if (n === 0) return 0;
  const sign = n > 0 ? 1 : -1;
  let count = 0;
  const cur = new Date(a);
  for (let i = 0; i < Math.abs(n); i++) {
    if (!isWeekend(cur)) count++;
    cur.setDate(cur.getDate() + sign);
  }
  return sign * count;
}

/** `d` plus n days; Date.setDate already rolls over months and years. */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * `d` plus n calendar months, clamping the day to the target month's end —
 * Jan 31 + 1 month is Feb 28 (or 29 in a leap year), not Mar 3.
 */
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), lastDay));
  return r;
}

export interface CalendarDiff {
  /** Whole calendar months from a to b. */
  months: number;
  /** Leftover days after those months, same sign as `months`. */
  days: number;
}

/** Whole months plus leftover days, e.g. Jan 15 → Mar 10 = 1 month 23 days. */
export function diffCalendar(a: Date, b: Date): CalendarDiff {
  const total = diffDays(a, b);
  if (total === 0) return { months: 0, days: 0 };
  const sign = total > 0 ? 1 : -1;
  const [lo, hi] = sign > 0 ? [a, b] : [b, a];
  let months = (hi.getFullYear() - lo.getFullYear()) * 12 + (hi.getMonth() - lo.getMonth());
  let pivot = addMonths(lo, months);
  if (pivot.getTime() > hi.getTime()) {
    months--;
    pivot = addMonths(lo, months);
  }
  return { months: sign * months, days: sign * diffDays(pivot, hi) };
}
