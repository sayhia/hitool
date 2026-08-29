import { describe, expect, it } from "vitest";
import {
  cmykToRgb,
  contrastRatio,
  harmonies,
  hslToRgb,
  hsvToRgb,
  mix,
  parseColor,
  ramp,
  relativeLuminance,
  rgbToCmyk,
  rgbToHsl,
  rgbToHsv,
  toHex,
  toHslString,
  toRgbString,
  wcagLevel,
} from "./color";

const RED = { r: 255, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

describe("parseColor", () => {
  it("reads the hex forms", () => {
    expect(parseColor("#ff0000")).toEqual(RED);
    expect(parseColor("ff0000")).toEqual(RED);
    expect(parseColor("#f00")).toEqual(RED);
    expect(parseColor("#FF0000")).toEqual(RED);
  });

  it("reads hex with alpha", () => {
    expect(parseColor("#ff000080")).toEqual({ ...RED, a: 128 / 255 });
    expect(parseColor("#f008")).toEqual({ ...RED, a: 136 / 255 });
    // Four digits is the #rgba shorthand, not a typo: transparent yellow.
    expect(parseColor("#ff00")).toEqual({ r: 255, g: 255, b: 0, a: 0 });
  });

  it("reads rgb() in both syntaxes", () => {
    expect(parseColor("rgb(255, 0, 0)")).toEqual(RED);
    expect(parseColor("rgb(255 0 0)")).toEqual(RED);
    expect(parseColor("rgba(255, 0, 0, 0.5)")).toEqual({ ...RED, a: 0.5 });
    expect(parseColor("rgb(255 0 0 / 50%)")).toEqual({ ...RED, a: 0.5 });
  });

  it("reads hsl()", () => {
    expect(parseColor("hsl(0, 100%, 50%)")).toEqual(RED);
    expect(parseColor("hsl(120 100% 50%)")).toEqual({ r: 0, g: 255, b: 0 });
  });

  it("returns null rather than guessing", () => {
    // A typo silently becoming black is how a wrong swatch reaches a stylesheet.
    for (const bad of ["", "   ", "#gg0000", "#ff", "rgb(1,2)", "nope", "rgb(a,b,c)", "#12345", "#1234567"]) {
      expect(parseColor(bad), bad).toBeNull();
    }
  });

  it("survives a round trip through hex", () => {
    for (const c of ["#000000", "#ffffff", "#5457d6", "#17855c", "#cf3f45"]) {
      expect(toHex(parseColor(c)!)).toBe(c);
    }
  });
});

describe("hsl conversion", () => {
  it("matches the textbook values", () => {
    expect(rgbToHsl(RED)).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToHsl({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 100, l: 50 });
    expect(rgbToHsl({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 100, l: 50 });
    expect(rgbToHsl(WHITE)).toEqual({ h: 0, s: 0, l: 100 });
    expect(rgbToHsl(BLACK)).toEqual({ h: 0, s: 0, l: 0 });
    expect(rgbToHsl({ r: 128, g: 128, b: 128 })).toMatchObject({ h: 0, s: 0 });
  });

  it("round-trips every hue within a step", () => {
    for (let h = 0; h < 360; h += 7) {
      const rgb = hslToRgb({ h, s: 0.6, l: 0.5 });
      const back = rgbToHsl(rgb);
      const delta = Math.min(Math.abs(back.h - h), 360 - Math.abs(back.h - h));
      expect(delta, `h=${h}`).toBeLessThanOrEqual(1);
    }
  });

  it("accepts saturation and lightness as either 0–1 or 0–100", () => {
    expect(hslToRgb({ h: 0, s: 1, l: 0.5 })).toEqual(RED);
    expect(hslToRgb({ h: 0, s: 100, l: 50 })).toEqual(RED);
  });

  it("wraps a hue outside the circle", () => {
    expect(hslToRgb({ h: 360, s: 1, l: 0.5 })).toEqual(RED);
    expect(hslToRgb({ h: -360, s: 1, l: 0.5 })).toEqual(RED);
    expect(hslToRgb({ h: 480, s: 1, l: 0.5 })).toEqual(hslToRgb({ h: 120, s: 1, l: 0.5 }));
  });
});

describe("formatting", () => {
  it("writes hex, rgb and hsl", () => {
    expect(toHex(RED)).toBe("#ff0000");
    expect(toRgbString(RED)).toBe("rgb(255, 0, 0)");
    expect(toHslString(RED)).toBe("hsl(0, 100%, 50%)");
  });

  it("only shows alpha when there is any", () => {
    expect(toRgbString({ ...RED, a: 1 })).toBe("rgb(255, 0, 0)");
    expect(toRgbString({ ...RED, a: 0.5 })).toBe("rgba(255, 0, 0, 0.5)");
    expect(toHex({ ...RED, a: 0.5 }, true)).toBe("#ff000080");
    expect(toHex({ ...RED, a: 0.5 })).toBe("#ff0000");
  });
});

describe("contrast", () => {
  it("puts black on white at the maximum", () => {
    expect(contrastRatio(BLACK, WHITE)).toBe(21);
    expect(contrastRatio(WHITE, BLACK)).toBe(21);
  });

  it("puts a colour against itself at the minimum", () => {
    expect(contrastRatio(RED, RED)).toBe(1);
  });

  it("linearises the channels rather than averaging them", () => {
    // Mid grey against white is ~3.95; the naive linear formula says ~2.
    const ratio = contrastRatio({ r: 128, g: 128, b: 128 }, WHITE);
    expect(ratio).toBeGreaterThan(3.9);
    expect(ratio).toBeLessThan(4.0);
  });

  it("weights green far above blue", () => {
    // The reason pure blue on white fails and pure green nearly passes.
    expect(relativeLuminance({ r: 0, g: 255, b: 0 })).toBeGreaterThan(
      relativeLuminance({ r: 0, g: 0, b: 255 }) * 8,
    );
  });

  it("grades against the WCAG thresholds", () => {
    expect(wcagLevel(21)).toBe("AAA");
    expect(wcagLevel(7)).toBe("AAA");
    expect(wcagLevel(6.99)).toBe("AA");
    expect(wcagLevel(4.5)).toBe("AA");
    expect(wcagLevel(4.49)).toBe("fail");
  });

  it("uses the lower bar only for large text", () => {
    expect(wcagLevel(3, true)).toBe("AA");
    expect(wcagLevel(3, false)).toBe("fail");
    expect(wcagLevel(4.5, true)).toBe("AAA");
  });
});

describe("mix", () => {
  it("returns each end at the extremes", () => {
    expect(mix(RED, WHITE, 0)).toEqual(RED);
    expect(mix(RED, WHITE, 1)).toEqual(WHITE);
  });

  it("meets in the middle", () => {
    expect(mix(BLACK, WHITE, 0.5)).toEqual({ r: 128, g: 128, b: 128 });
  });

  it("clamps a ratio outside 0–1", () => {
    expect(mix(RED, WHITE, -1)).toEqual(RED);
    expect(mix(RED, WHITE, 5)).toEqual(WHITE);
  });
});

describe("ramp", () => {
  it("puts the base colour exactly in the middle", () => {
    const r = ramp(RED, 9);
    expect(r).toHaveLength(9);
    expect(r[4]).toEqual(RED);
  });

  it("forces an odd length so the base is not nudged off its own ramp", () => {
    expect(ramp(RED, 8)).toHaveLength(9);
    expect(ramp(RED, 8)[4]).toEqual(RED);
  });

  it("runs light to dark", () => {
    const lums = ramp({ r: 84, g: 87, b: 214 }).map(relativeLuminance);
    for (let i = 1; i < lums.length; i++) expect(lums[i]).toBeLessThan(lums[i - 1]);
  });

  it("starts at white and stops short of black", () => {
    const r = ramp(RED);
    expect(r[0]).toEqual(WHITE);
    // A ramp whose last step is pure black has thrown the hue away.
    expect(r[r.length - 1]).not.toEqual(BLACK);
    expect(relativeLuminance(r[r.length - 1])).toBeLessThan(relativeLuminance(RED));
  });

  it("never asks for fewer than three steps", () => {
    expect(ramp(RED, 1).length).toBeGreaterThanOrEqual(3);
  });
});

describe("harmonies", () => {
  it("rotates the hue and keeps saturation and lightness", () => {
    const base = hslToRgb({ h: 210, s: 0.7, l: 0.5 });
    const { s, l } = rgbToHsl(base);
    for (const h of harmonies(base)) {
      const got = rgbToHsl(h.rgb);
      expect(Math.abs(got.s - s), h.name).toBeLessThan(2);
      expect(Math.abs(got.l - l), h.name).toBeLessThan(2);
    }
  });

  it("puts the complement opposite", () => {
    const base = hslToRgb({ h: 30, s: 0.8, l: 0.5 });
    const comp = harmonies(base).find((h) => h.name === "complement")!;
    expect(Math.abs(rgbToHsl(comp.rgb).h - 210)).toBeLessThanOrEqual(1);
  });

  it("wraps below zero for the analogous side", () => {
    const base = hslToRgb({ h: 10, s: 0.8, l: 0.5 });
    const a = harmonies(base).find((h) => h.name === "analogA")!;
    expect(rgbToHsl(a.rgb).h).toBeGreaterThan(300);
  });
});

describe("hsv", () => {
  it("converts pure colours to the expected hsv", () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, v: 100 });
    expect(rgbToHsv({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 100, v: 100 });
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 });
    expect(rgbToHsv({ r: 255, g: 255, b: 255 })).toEqual({ h: 0, s: 0, v: 100 });
  });

  it("round-trips through rgb", () => {
    for (const c of [
      { r: 214, g: 93, b: 44 },
      { r: 18, g: 190, b: 200 },
      { r: 128, g: 128, b: 128 },
    ]) {
      const back = hsvToRgb(rgbToHsv(c));
      expect(Math.abs(back.r - c.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - c.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - c.b)).toBeLessThanOrEqual(1);
    }
  });
});

describe("cmyk", () => {
  it("maps primaries and black", () => {
    expect(rgbToCmyk({ r: 255, g: 0, b: 0 })).toEqual({ c: 0, m: 100, y: 100, k: 0 });
    expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    expect(rgbToCmyk({ r: 255, g: 255, b: 255 })).toEqual({ c: 0, m: 0, y: 0, k: 0 });
  });

  it("round-trips within rounding tolerance", () => {
    const c = { r: 90, g: 160, b: 220 };
    const back = cmykToRgb(rgbToCmyk(c));
    expect(Math.abs(back.r - c.r)).toBeLessThanOrEqual(2);
    expect(Math.abs(back.g - c.g)).toBeLessThanOrEqual(2);
    expect(Math.abs(back.b - c.b)).toBeLessThanOrEqual(2);
  });
});
