export function percentOf(pct: number, of: number): number {
  return (pct / 100) * of;
}

/** `part` is what percent of `whole`. */
export function isWhatPercent(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return (part / whole) * 100;
}

/** `part` is `pct`% of what. */
export function percentIs(part: number, pct: number): number | null {
  if (pct === 0) return null;
  return (part * 100) / pct;
}

export function changePercent(from: number, to: number): number | null {
  if (from === 0) return null;
  return ((to - from) / from) * 100;
}

export function roundNice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return String(Number(n.toFixed(digits)));
}
