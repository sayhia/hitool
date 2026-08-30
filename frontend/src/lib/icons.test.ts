import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { h } from "vue";
import { renderToString } from "@vue/server-renderer";
import * as lucide from "lucide-vue-next";
import { ICONS, iconByName } from "./icons";
import { CATEGORIES, TOOLS } from "./tools";

/**
 * icons.ts is a hand-shipped subset of lucide, so the thing that can rot is the
 * subset: use a new icon name in a template and the registry lookup silently
 * falls back to a box. This re-derives the needed set the same way the registry
 * was built — every PascalCase string literal in the source that happens to name
 * a real lucide export — and demands it be present.
 *
 * A literal that merely looks like an icon name (a label, a keyboard modifier)
 * gets swept in too. That is the intended bias: a spurious entry costs a few
 * hundred bytes, a missing one costs a visibly wrong icon.
 */
const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    if (!/\.(ts|vue)$/.test(e.name) || /\.test\.ts$/.test(e.name)) return [];
    return [p];
  });
}

function iconNamesInSource(): Set<string> {
  const exported = new Set(Object.keys(lucide));
  const names = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, "utf8");
    // {0,40} rather than {1,40}: lucide's only one-character export is "X",
    // and it is the close button on every dialog in the app. A minimum of two
    // let that one slip through and draw a box on every panel.
    for (const m of src.matchAll(/["']([A-Z][A-Za-z0-9]{0,40})["']/g)) {
      if (exported.has(m[1])) names.add(m[1]);
    }
  }
  return names;
}

describe("icon registry", () => {
  it("covers every lucide name the source mentions", () => {
    const missing = [...iconNamesInSource()].filter((n) => !(n in ICONS)).sort();
    expect(missing).toEqual([]);
  });

  it("covers the tool and category registries", () => {
    const declared = [...TOOLS.map((t) => t.icon), ...CATEGORIES.map((c) => c.icon)];
    expect(declared.filter((n) => !(n in ICONS))).toEqual([]);
  });

  it("ships far less than all of lucide", () => {
    // The whole point of the file. If this ever approaches the full set,
    // someone has re-introduced a barrel import.
    expect(Object.keys(ICONS).length).toBeLessThan(Object.keys(lucide).length / 4);
  });

  it("renders every registered name as an svg", async () => {
    // A name present in the registry but bound to something unrenderable would
    // still pass the coverage checks above and then draw nothing in the app.
    const broken: string[] = [];
    for (const name of Object.keys(ICONS)) {
      const html = await renderToString(h(iconByName(name)));
      if (!html.startsWith("<svg")) broken.push(name);
    }
    expect(broken).toEqual([]);
  });

  it("falls back to a box for unknown names", () => {
    expect(iconByName("NoSuchIcon")).toBe(ICONS.Box);
    expect(iconByName("Palette")).toBe(ICONS.Palette);
  });
});
