/**
 * Turning a set of colours into something you can paste into a project.
 *
 * The formats differ in more than punctuation: Tailwind wants a nested object,
 * Android wants `#AARRGGBB` with the alpha *first*, and Swift wants channels
 * as fractions. Getting any of those subtly wrong produces a file that
 * compiles and is the wrong colour, so each one is pinned by a test.
 */
import { toHex, type RGB } from "./color";

export interface Swatch {
  name: string;
  rgb: RGB;
}

export type PaletteFormat = "css" | "scss" | "tailwind" | "json" | "swift" | "android";

export const PALETTE_FORMATS: PaletteFormat[] = [
  "css",
  "scss",
  "tailwind",
  "json",
  "swift",
  "android",
];

/** A safe identifier: lower kebab for CSS, which the others reshape. */
export function slug(name: string, index: number): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || `color-${index + 1}`;
}

const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase());

/**
 * A name usable as an identifier in a programming language.
 *
 * CSS custom properties and JSON keys happily start with a digit; SCSS
 * variables, Swift constants and Android resource names do not. A ramp named
 * the usual way — 100, 200, 300 — therefore produces three files that compile
 * and one that does not, unless the digit is moved off the front.
 */
function identifier(id: string): string {
  return /^[0-9]/.test(id) ? `c${id}` : id;
}

const f = (v: number) => (v / 255).toFixed(3).replace(/0+$/, "").replace(/\.$/, ".0");

export function toPalette(
  swatches: Swatch[],
  format: PaletteFormat,
  prefix = "color",
): string {
  const named = swatches.map((s, i) => ({ ...s, id: slug(s.name, i) }));
  if (!named.length) return "";

  switch (format) {
    case "css":
      return [
        ":root {",
        ...named.map((s) => `  --${prefix}-${s.id}: ${toHex(s.rgb)};`),
        "}",
      ].join("\n");

    case "scss":
      return named.map((s) => `$${prefix}-${identifier(s.id)}: ${toHex(s.rgb)};`).join("\n");

    case "tailwind":
      return [
        "module.exports = {",
        "  theme: {",
        "    extend: {",
        "      colors: {",
        ...named.map((s) => `        "${s.id}": "${toHex(s.rgb)}",`),
        "      },",
        "    },",
        "  },",
        "};",
      ].join("\n");

    case "json":
      return JSON.stringify(
        Object.fromEntries(named.map((s) => [s.id, toHex(s.rgb)])),
        null,
        2,
      );

    case "swift":
      return named
        .map(
          (s) =>
            `static let ${camel(identifier(s.id))} = Color(red: ${f(s.rgb.r)}, green: ${f(s.rgb.g)}, blue: ${f(s.rgb.b)})`,
        )
        .join("\n");

    case "android": {
      // Android puts alpha first and wants it explicit; a colour written as
      // #RRGGBB there is still opaque, but a converter that emits #RRGGBBAA
      // produces a value that parses as a completely different colour.
      const hex2 = (v: number) => Math.round(v).toString(16).padStart(2, "0").toUpperCase();
      return [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<resources>",
        ...named.map((s) => {
          const a = s.rgb.a === undefined ? 255 : Math.round(s.rgb.a * 255);
          return `    <color name="${identifier(s.id).replace(/-/g, "_")}">#${hex2(a)}${hex2(s.rgb.r)}${hex2(s.rgb.g)}${hex2(s.rgb.b)}</color>`;
        }),
        "</resources>",
      ].join("\n");
    }
  }
}

/** File extension a format wants, for the export dialog. */
export function paletteExt(format: PaletteFormat): string {
  return { css: "css", scss: "scss", tailwind: "js", json: "json", swift: "swift", android: "xml" }[
    format
  ];
}
