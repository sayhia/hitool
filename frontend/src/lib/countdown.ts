/**
 * Countdown day arithmetic. All comparisons are calendar-day based: hours
 * and time zones are stripped so "3 days to go" means three sleeps, not a
 * floating point remainder.
 */

export interface CountdownItem {
  id: string;
  name: string;
  /** Target date as YYYY-MM-DD. */
  date: string;
  /** Recurring: rolls forward to the next yearly occurrence. */
  yearly: boolean;
}

/** Midnight of the given date, so day differences are exact whole days. */
export function dayOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: Date, to: Date): number {
  const ms = dayOnly(to).getTime() - dayOnly(from).getTime();
  return Math.round(ms / 86400000);
}

/** Parse YYYY-MM-DD as a local date (Date's ISO parsing would use UTC). */
export function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Overflow wraps ("2026-02-30" → Mar 2, "2026-13-01" → Jan '27); reject it.
  if (d.getMonth() + 1 !== Number(m[2]) || d.getDate() !== Number(m[3])) return null;
  return d;
}

/**
 * The next occurrence of a month/day at or after `today`. A Feb 29 anniversary
 * lands on Feb 28 in common years rather than spilling into March.
 */
export function nextOccurrence(month: number, day: number, today: Date): Date {
  const t = dayOnly(today);
  for (let year = t.getFullYear(); ; year++) {
    const last = new Date(year, month, 0).getDate(); // days in that month
    const d = new Date(year, month - 1, Math.min(day, last));
    if (d.getTime() >= t.getTime()) return d;
  }
}

/**
 * Days until an item's target. A past one-off event keeps its negative count
 * ("3 days ago"); a yearly one rolls forward to its next occurrence.
 */
export function daysUntil(item: CountdownItem, today: Date): number {
  const base = parseDate(item.date);
  if (!base) return 0;
  if (item.yearly) {
    return daysBetween(today, nextOccurrence(base.getMonth() + 1, base.getDate(), today));
  }
  return daysBetween(today, base);
}

/** The calendar date an item actually falls on, given today. */
export function targetOf(item: CountdownItem, today: Date): Date | null {
  const base = parseDate(item.date);
  if (!base) return null;
  if (item.yearly) return nextOccurrence(base.getMonth() + 1, base.getDate(), today);
  return base;
}
