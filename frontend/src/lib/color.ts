/**
 * Colour conversion, contrast and ramps.
 *
 * Everything here works in sRGB with 8-bit channels, because that is what gets
 * pasted in and what gets copied out. The one place that leaves sRGB is the
 * contrast check: WCAG defines it on linearised luminance, and skipping the
 * linearisation is the classic way to ship a "passes AA" badge that lies.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
  /** 0–1. Absent means opaque. */
  a?: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface HSV {
  h: number;
  /** 0–100, matching the HSL convention used above. */
  s: number;
  v: number;
}

export interface CMYK {
  /** All four channels 0–100. */
  c: number;
  m: number;
  y: number;
  k: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 100) / 100;
const byte = (v: number) => clamp(Math.round(v), 0, 255);

/**
 * Read a colour written any of the ways people actually paste them.
 *
 * `#abc`, `#aabbcc`, `#aabbccdd`, with or without the hash, plus `rgb()` /
 * `rgba()` / `hsl()` / `hsla()` in both the comma and the space syntax.
 * Returns null rather than a fallback colour: silently turning a typo into
 * black is how a wrong swatch ends up in a stylesheet.
 */
export function parseColor(input: string): RGB | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  // The digits are validated whether or not there was a hash: taking `#gg0000`
  // on trust yields `{r: NaN}`, which every consumer then renders as garbage
  // instead of showing the user that the colour did not parse.
  const body = s.startsWith("#") ? s.slice(1) : s;
  const hex = /^[0-9a-f]+$/.test(body) ? body : "";
  if (hex) {
    const expand = (h: string) => parseInt(h.length === 1 ? h + h : h, 16);
    if (hex.length === 3 || hex.length === 4) {
      const p = hex.split("");
      const a = hex.length === 4 ? expand(p[3]) / 255 : undefined;
      return { r: expand(p[0]), g: expand(p[1]), b: expand(p[2]), ...(a !== undefined && { a }) };
    }
    if (hex.length === 6 || hex.length === 8) {
      const p = hex.match(/../g)!;
      const a = hex.length === 8 ? parseInt(p[3], 16) / 255 : undefined;
      return {
        r: parseInt(p[0], 16),
        g: parseInt(p[1], 16),
        b: parseInt(p[2], 16),
        ...(a !== undefined && { a }),
      };
    }
    return null;
  }

  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(s);
  if (!fn) return null;
  const parts = fn[2].split(/[,/\s]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const num = (t: string, scale = 1) =>
    t.endsWith("%") ? (parseFloat(t) / 100) * scale : parseFloat(t);
  if (parts.some((p) => Number.isNaN(parseFloat(p)))) return null;

  const alpha = parts[3] !== undefined ? clamp(num(parts[3], 1), 0, 1) : undefined;
  if (fn[1].startsWith("rgb")) {
    return {
      r: byte(num(parts[0], 255)),
      g: byte(num(parts[1], 255)),
      b: byte(num(parts[2], 255)),
      ...(alpha !== undefined && { a: alpha }),
    };
  }
  const rgb = hslToRgb({
    h: parseFloat(parts[0]),
    s: parseFloat(parts[1]) / 100,
    l: parseFloat(parts[2]) / 100,
  });
  return alpha !== undefined ? { ...rgb, a: alpha } : rgb;
}

export function toHex({ r, g, b, a }: RGB, withAlpha = false): string {
  const h = (v: number) => byte(v).toString(16).padStart(2, "0");
  const base = `#${h(r)}${h(g)}${h(b)}`;
  return withAlpha && a !== undefined && a < 1 ? base + h(a * 255) : base;
}

export function toRgbString({ r, g, b, a }: RGB): string {
  return a !== undefined && a < 1
    ? `rgba(${byte(r)}, ${byte(g)}, ${byte(b)}, ${round(a)})`
    : `rgb(${byte(r)}, ${byte(g)}, ${byte(b)})`;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  // Whole percentages: this is what gets pasted into CSS, and a colour
  // picked to two decimal places is two decimal places of noise.
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const H = ((h % 360) + 360) % 360;
  const S = clamp(s > 1 ? s / 100 : s, 0, 1);
  const L = clamp(l > 1 ? l / 100 : l, 0, 1);
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((H / 60) % 2) - 1));
  const m = L - c / 2;
  const seg = Math.floor(H / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg];
  return { r: byte((r + m) * 255), g: byte((g + m) * 255), b: byte((b + m) * 255) };
}

export function toHslString(rgb: RGB): string {
  const { h, s, l } = rgbToHsl(rgb);
  return rgb.a !== undefined && rgb.a < 1
    ? `hsla(${h}, ${s}%, ${l}%, ${round(rgb.a)})`
    : `hsl(${h}, ${s}%, ${l}%)`;
}

/** WCAG relative luminance: sRGB channels linearised, then weighted. */
export function relativeLuminance({ r, g, b }: RGB): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** 1 (identical) to 21 (black against white). */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export type WcagLevel = "AAA" | "AA" | "fail";

/**
 * WCAG 2.2 thresholds. Large text is 18pt, or 14pt bold — the allowance
 * exists because heavier strokes stay legible at lower contrast, so applying
 * it to body text is the mistake this signature tries to make hard.
 */
export function wcagLevel(ratio: number, largeText = false): WcagLevel {
  if (largeText) return ratio >= 4.5 ? "AAA" : ratio >= 3 ? "AA" : "fail";
  return ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : "fail";
}

/** Blend two colours; `t` 0 keeps the first, 1 the second. */
export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = clamp(t, 0, 1);
  return {
    r: byte(a.r + (b.r - a.r) * k),
    g: byte(a.g + (b.g - a.g) * k),
    b: byte(a.b + (b.b - a.b) * k),
  };
}

/**
 * A tint-to-shade ramp through the given colour, white at one end and near
 * black at the other. `steps` must be odd so the input sits exactly in the
 * middle rather than being nudged off its own ramp.
 */
export function ramp(base: RGB, steps = 9): RGB[] {
  const n = Math.max(3, steps % 2 === 0 ? steps + 1 : steps);
  const mid = (n - 1) / 2;
  const white: RGB = { r: 255, g: 255, b: 255 };
  const black: RGB = { r: 0, g: 0, b: 0 };
  return Array.from({ length: n }, (_, i) => {
    if (i === mid) return { ...base };
    // The dark end stops short of pure black: the last step of a real ramp is
    // a very dark version of the hue, not an absence of it.
    return i < mid
      ? mix(white, base, i / mid)
      : mix(base, black, ((i - mid) / mid) * 0.85);
  });
}

/** Hue-rotated companions: complement, triad and the two analogous sides. */
export function harmonies(base: RGB): { name: string; rgb: RGB }[] {
  const { h, s, l } = rgbToHsl(base);
  const at = (deg: number) => hslToRgb({ h: h + deg, s, l });
  return [
    { name: "complement", rgb: at(180) },
    { name: "triadA", rgb: at(120) },
    { name: "triadB", rgb: at(240) },
    { name: "analogA", rgb: at(-30) },
    { name: "analogB", rgb: at(30) },
  ];
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return {
    h: Math.round(h),
    s: max === 0 ? 0 : Math.round((d / max) * 100),
    v: Math.round(max * 100),
  };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const H = ((h % 360) + 360) % 360;
  const S = clamp(s > 1 ? s / 100 : s, 0, 1);
  const V = clamp(v > 1 ? v / 100 : v, 0, 1);
  const c = V * S;
  const x = c * (1 - Math.abs(((H / 60) % 2) - 1));
  const m = V - c;
  const seg = Math.floor(H / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg];
  return { r: byte((r + m) * 255), g: byte((g + m) * 255), b: byte((b + m) * 255) };
}

/**
 * The print model. Pure black ink is cheaper than full CMY, so K takes as much
 * of the darkness as it can (the "rich black" formula).
 */
export function rgbToCmyk({ r, g, b }: RGB): CMYK {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const k = 1 - Math.max(R, G, B);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  const pct = (v: number) => Math.round(((1 - v - k) / (1 - k)) * 100);
  return { c: pct(R), m: pct(G), y: pct(B), k: Math.round(k * 100) };
}

export function cmykToRgb({ c, m, y, k }: CMYK): RGB {
  const C = clamp(c, 0, 100) / 100;
  const M = clamp(m, 0, 100) / 100;
  const Y = clamp(y, 0, 100) / 100;
  const K = clamp(k, 0, 100) / 100;
  return {
    r: byte(255 * (1 - C) * (1 - K)),
    g: byte(255 * (1 - M) * (1 - K)),
    b: byte(255 * (1 - Y) * (1 - K)),
  };
}
