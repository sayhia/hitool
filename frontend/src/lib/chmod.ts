export type Rwx = { r: boolean; w: boolean; x: boolean };
export type SpecialBits = { setuid: boolean; setgid: boolean; sticky: boolean };
export type ModeBits = { u: Rwx; g: Rwx; o: Rwx; special: SpecialBits };

export const EMPTY_RWX: Rwx = { r: false, w: false, x: false };
export const EMPTY_SPECIAL: SpecialBits = { setuid: false, setgid: false, sticky: false };

export function emptyMode(): ModeBits {
  return {
    u: { ...EMPTY_RWX }, g: { ...EMPTY_RWX }, o: { ...EMPTY_RWX },
    special: { ...EMPTY_SPECIAL },
  };
}

function digit(b: Rwx): number {
  return (b.r ? 4 : 0) + (b.w ? 2 : 0) + (b.x ? 1 : 0);
}

function fromDigit(n: number): Rwx {
  const v = n & 7;
  return { r: !!(v & 4), w: !!(v & 2), x: !!(v & 1) };
}

function specialDigit(s: SpecialBits): number {
  return (s.setuid ? 4 : 0) + (s.setgid ? 2 : 0) + (s.sticky ? 1 : 0);
}

export function toOctal(m: ModeBits): string {
  const sp = specialDigit(m.special);
  const base = `${digit(m.u)}${digit(m.g)}${digit(m.o)}`;
  return sp ? `${sp}${base}` : base;
}

export function toFullOctal(m: ModeBits): string {
  return `${specialDigit(m.special)}${digit(m.u)}${digit(m.g)}${digit(m.o)}`;
}

export function fromOctal(s: string): ModeBits | null {
  const t = s.trim().replace(/^0/, "");
  if (!/^[0-7]{3,4}$/.test(t)) return null;
  const has4 = t.length === 4;
  const u = fromDigit(Number(t[has4 ? 1 : 0]));
  const g = fromDigit(Number(t[has4 ? 2 : 1]));
  const o = fromDigit(Number(t[has4 ? 3 : 2]));
  const special: SpecialBits = has4
    ? { setuid: !!(Number(t[0]) & 4), setgid: !!(Number(t[0]) & 2), sticky: !!(Number(t[0]) & 1) }
    : { ...EMPTY_SPECIAL };
  return { u, g, o, special };
}

export function toSymbolic(m: ModeBits): string {
  const one = (b: Rwx) => `${b.r ? "r" : "-"}${b.w ? "w" : "-"}${b.x ? "x" : "-"}`;
  let s = one(m.u) + one(m.g) + one(m.o);
  const chars = s.split("");
  if (m.special.setuid) chars[2] = m.u.x ? "s" : "S";
  if (m.special.setgid) chars[5] = m.g.x ? "s" : "S";
  if (m.special.sticky) chars[8] = m.o.x ? "t" : "T";
  return chars.join("");
}

export function toBinary(m: ModeBits): string {
  const sp = specialDigit(m.special);
  const part = (b: Rwx) => `${b.r ? "1" : "0"}${b.w ? "1" : "0"}${b.x ? "1" : "0"}`;
  return `${sp & 4 ? "1" : "0"}${sp & 2 ? "1" : "0"}${sp & 1 ? "1" : "0"} ${part(m.u)} ${part(m.g)} ${part(m.o)}`;
}

export function toChmodCommand(m: ModeBits, path = "file"): string {
  return `chmod ${toOctal(m)} ${path}`;
}
