export function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a || 1;
}

export function simplify(w: number, h: number): { w: number; h: number } {
  const g = gcd(w, h);
  return { w: Math.round(w) / g, h: Math.round(h) / g };
}

export function heightForWidth(w: number, rw: number, rh: number): number | null {
  if (!rw) return null;
  return (w * rh) / rw;
}

export function widthForHeight(h: number, rw: number, rh: number): number | null {
  if (!rh) return null;
  return (h * rw) / rh;
}

export const PRESETS = [
  { id: "16-9", w: 16, h: 9 },
  { id: "4-3", w: 4, h: 3 },
  { id: "1-1", w: 1, h: 1 },
  { id: "21-9", w: 21, h: 9 },
  { id: "9-16", w: 9, h: 16 },
  { id: "3-2", w: 3, h: 2 },
  { id: "2-3", w: 2, h: 3 },
] as const;
