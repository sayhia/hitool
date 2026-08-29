import { describe, expect, it } from "vitest";
import { PALETTE_FORMATS, paletteExt, slug, toPalette, type Swatch } from "./palette";

const SW: Swatch[] = [
  { name: "Brand Primary", rgb: { r: 84, g: 87, b: 214 } },
  { name: "ok", rgb: { r: 23, g: 133, b: 92 } },
];

describe("slug", () => {
  it("kebab-cases a name", () => {
    expect(slug("Brand Primary", 0)).toBe("brand-primary");
    expect(slug("Accent/2", 0)).toBe("accent-2");
  });

  it("falls back rather than emitting an empty identifier", () => {
    expect(slug("", 3)).toBe("color-4");
    expect(slug("中文", 0)).toBe("color-1");
  });
});

describe("toPalette", () => {
  it("writes CSS custom properties", () => {
    expect(toPalette(SW, "css")).toBe(
      ":root {\n  --color-brand-primary: #5457d6;\n  --color-ok: #17855c;\n}",
    );
  });

  it("honours a custom prefix", () => {
    expect(toPalette(SW, "css", "brand")).toContain("--brand-brand-primary:");
  });

  it("writes SCSS variables", () => {
    expect(toPalette(SW, "scss")).toBe("$color-brand-primary: #5457d6;\n$color-ok: #17855c;");
  });

  it("writes a Tailwind config that parses as JS", () => {
    const out = toPalette(SW, "tailwind");
    expect(out).toContain('"brand-primary": "#5457d6",');
    expect(out.startsWith("module.exports = {")).toBe(true);
  });

  it("writes JSON that parses", () => {
    expect(JSON.parse(toPalette(SW, "json"))).toEqual({
      "brand-primary": "#5457d6",
      ok: "#17855c",
    });
  });

  it("writes Swift with channels as fractions", () => {
    const out = toPalette(SW, "swift");
    expect(out).toContain("static let brandPrimary = Color(red: 0.329, green: 0.341, blue: 0.839)");
  });

  it("writes Android colours with alpha first", () => {
    // #AARRGGBB, not #RRGGBBAA — the other order parses as a different colour.
    const out = toPalette(SW, "android");
    expect(out).toContain('<color name="brand_primary">#FF5457D6</color>');
  });

  it("carries a real alpha into the Android value", () => {
    const out = toPalette([{ name: "half", rgb: { r: 0, g: 0, b: 0, a: 0.5 } }], "android");
    expect(out).toContain("#80000000");
  });

  it("returns empty for no swatches", () => {
    for (const f of PALETTE_FORMATS) expect(toPalette([], f), f).toBe("");
  });

  it("names the colour in whatever way its own format does", () => {
    // Not every format carries hex: Swift expresses channels as fractions and
    // Android upper-cases them behind an alpha byte.
    const expected: Record<string, string> = {
      css: "#5457d6",
      scss: "#5457d6",
      tailwind: "#5457d6",
      json: "#5457d6",
      swift: "red: 0.329",
      android: "#FF5457D6",
    };
    for (const f of PALETTE_FORMATS) {
      expect(toPalette(SW, f).length, f).toBeGreaterThan(10);
      expect(toPalette(SW, f), f).toContain(expected[f]);
    }
  });
});

describe("identifiers", () => {
  const ramp: Swatch[] = [
    { name: "100", rgb: { r: 255, g: 255, b: 255 } },
    { name: "200", rgb: { r: 0, g: 0, b: 0 } },
  ];

  it("does not emit a Swift constant starting with a digit", () => {
    // `static let 100 = …` does not compile.
    const out = toPalette(ramp, "swift");
    expect(out).toContain("static let c100 =");
    expect(out).not.toMatch(/static let \d/);
  });

  it("does not emit an SCSS variable starting with a digit", () => {
    expect(toPalette(ramp, "scss")).toContain("$color-c100:");
  });

  it("does not emit an Android resource name starting with a digit", () => {
    expect(toPalette(ramp, "android")).toContain('name="c100"');
  });

  it("leaves the formats that allow it alone", () => {
    // A CSS custom property and a JSON key may both begin with a digit.
    expect(toPalette(ramp, "css")).toContain("--color-100:");
    expect(JSON.parse(toPalette(ramp, "json"))).toHaveProperty("100");
  });
});

describe("paletteExt", () => {
  it("gives every format a file extension", () => {
    for (const f of PALETTE_FORMATS) expect(paletteExt(f), f).toMatch(/^[a-z]+$/);
  });
});
