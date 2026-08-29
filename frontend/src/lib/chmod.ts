export type Rwx = { r: boolean; w: boolean; x: boolean };
export type ModeBits = { u: Rwx; g: Rwx; o: Rwx };

export const EMPTY_RWX: Rwx = { r: false, w: false, x: false };

export function emptyMode(): ModeBits {
  return { u: { ...EMPTY_RWX }, g: { ...EMPTY_RWX }, o: { ...EMPTY_RWX } };
}

function digit(b: Rwx): number {
  return (b.r ? 4 : 0) + (b.w ? 2 : 0) + (b.x ? 1 : 0);
}

function fromDigit(n: number): Rwx {
  const v = n & 7;
  return { r: !!(v & 4), w: !!(v & 2), x: !!(v & 1) };
}

export function toOctal(m: ModeBits): string {
  return `${digit(m.u)}${digit(m.g)}${digit(m.o)}`;
}

export function fromOctal(s: string): ModeBits | null {
  const t = s.trim().replace(/^0/, "");
  if (!/^[0-7]{3}$/.test(t)) return null;
  return {
    u: fromDigit(Number(t[0])),
    g: fromDigit(Number(t[1])),
    o: fromDigit(Number(t[2])),
  };
}

export function toSymbolic(m: ModeBits): string {
  const one = (b: Rwx) => `${b.r ? "r" : "-"}${b.w ? "w" : "-"}${b.x ? "x" : "-"}`;
  return one(m.u) + one(m.g) + one(m.o);
}
