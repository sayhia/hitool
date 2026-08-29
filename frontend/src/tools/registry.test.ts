import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  TOOLS,
  TOOL_ALIASES,
  canonicalToolId,
  toolById,
  toolIdOfPath,
  toolsAccepting,
  toolsInCategory,
  CATEGORY_GROUPS,
  type CategoryId,
} from "../lib/tools";
import { manifestFor, defaultValues } from "./manifest";
import { bespokeLoader, isKnownTool } from "./bespoke";
import zh from "../locales/zh.json";
import en from "../locales/en.json";

/**
 * These are the checks that catch a half-added tool: registered in the
 * catalogue but with no implementation, or with an implementation but no
 * translation. Both have actually happened during development.
 */
describe("tool registry", () => {
  it("gives every tool exactly one implementation", () => {
    const orphans = TOOLS.filter((t) => !bespokeLoader(t.id) && !manifestFor(t.id));
    expect(orphans.map((t) => t.id)).toEqual([]);
  });

  it("does not implement a tool twice", () => {
    const both = TOOLS.filter((t) => bespokeLoader(t.id) && manifestFor(t.id));
    expect(both.map((t) => t.id)).toEqual([]);
  });

  it("has no implementation without a catalogue entry", () => {
    const ids = new Set(TOOLS.map((t) => t.id));
    // Every manifest id must be a known tool…
    for (const t of TOOLS) if (manifestFor(t.id)) expect(ids.has(t.id)).toBe(true);
    // …and isKnownTool must agree with the catalogue.
    for (const t of TOOLS) expect(isKnownTool(t.id), t.id).toBe(true);
    expect(isKnownTool("no-such-tool")).toBe(false);
  });

  it("uses unique ids", () => {
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length);
  });

  it("places every tool in a declared category", () => {
    const cats = new Set(CATEGORIES.map((c) => c.id));
    for (const t of TOOLS) expect(cats.has(t.category), t.id).toBe(true);
  });

  it("leaves no category empty", () => {
    for (const c of CATEGORIES) {
      expect(toolsInCategory(c.id).length, c.id).toBeGreaterThan(0);
    }
  });

  it("reads a tool id only from a tool route", () => {
    // `/c/:id` and `/t/:id` both fill `params.id`, so a component that reads
    // the param sees a category page as an unknown tool. ToolHost redirects on
    // an unknown tool and stays alive in the KeepAlive cache — which sent
    // every category page back to the launcher once any tool had been opened.
    for (const t of TOOLS) expect(toolIdOfPath(`/t/${t.id}`), t.id).toBe(t.id);
    for (const c of CATEGORIES) expect(toolIdOfPath(`/c/${c.id}`), c.id).toBe("");
    expect(toolIdOfPath("/")).toBe("");
    expect(toolIdOfPath("/settings")).toBe("");
    expect(toolIdOfPath("/t/")).toBe("");
    expect(toolIdOfPath("/t/a/b")).toBe("");
    // Unknown but well-formed ids still come back; deciding they do not exist
    // is the caller's job, and that is what drives the redirect.
    expect(toolIdOfPath("/t/no-such-tool")).toBe("no-such-tool");
  });

  it("resolves ids back to their definition", () => {
    for (const t of TOOLS) expect(toolById(t.id)).toBe(t);
    expect(toolById("nope")).toBeUndefined();
  });

  it("points retired ids at the tool that absorbed them", () => {
    for (const [from, to] of Object.entries(TOOL_ALIASES)) {
      expect(canonicalToolId(from), from).toBe(to.id);
      expect(toolById(from)?.id, from).toBe(to.id);
      expect(isKnownTool(from), from).toBe(true);
      expect(TOOLS.some((t) => t.id === from), from).toBe(false);
    }
  });
});

describe("category groups", () => {
  const dict = (o: unknown, path: string) =>
    path.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], o);

  it("covers every tool in a grouped category exactly once", () => {
    for (const [cat, groups] of Object.entries(CATEGORY_GROUPS)) {
      const ids = groups!.flatMap((g) => g.tools);
      expect(new Set(ids).size, cat).toBe(ids.length);
      expect([...ids].sort(), cat).toEqual(
        toolsInCategory(cat as CategoryId)
          .map((t) => t.id)
          .sort(),
      );
    }
  });

  it("keeps the catalogue in group order", () => {
    // TOOLS promises the grouping's adjacency — the rail's sibling list and
    // the launcher's suggestions read that flat order, so a group whose ids
    // are not ascending there would silently un-group those surfaces.
    for (const [cat, groups] of Object.entries(CATEGORY_GROUPS)) {
      const order = toolsInCategory(cat as CategoryId).map((t) => t.id);
      let cursor = -1;
      for (const id of groups!.flatMap((g) => g.tools)) {
        const at = order.indexOf(id);
        expect(at, `${cat}:${id}`).toBeGreaterThan(cursor);
        cursor = at;
      }
    }
  });

  it("labels every group in both locales", () => {
    for (const loc of [zh, en]) {
      for (const [cat, groups] of Object.entries(CATEGORY_GROUPS)) {
        for (const g of groups!) {
          expect(dict(loc, `groups.${cat}.${g.id}`), `${cat}.${g.id}`).toBeTruthy();
        }
      }
      expect(dict(loc, "groups.misc")).toBeTruthy();
    }
  });
});

describe("translations", () => {
  const dict = (o: unknown, path: string) =>
    path.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], o);

  for (const [name, loc] of [
    ["zh", zh],
    ["en", en],
  ] as const) {
    it(`${name} names and describes every tool`, () => {
      const missing = TOOLS.filter(
        (t) => !dict(loc, `tools.${t.id}.name`) || !dict(loc, `tools.${t.id}.desc`),
      );
      expect(missing.map((t) => t.id)).toEqual([]);
    });

    it(`${name} labels every category`, () => {
      const missing = CATEGORIES.filter((c) => !dict(loc, `nav.${c.id}`));
      expect(missing.map((c) => c.id)).toEqual([]);
    });
  }

  it("keeps zh and en structurally identical", () => {
    const keys = (o: unknown, p = ""): string[] =>
      typeof o === "object" && o !== null
        ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k))
        : [p];
    const zk = new Set(keys(zh));
    const ek = new Set(keys(en));
    expect([...zk].filter((k) => !ek.has(k))).toEqual([]);
    expect([...ek].filter((k) => !zk.has(k))).toEqual([]);
  });
});

describe("manifests", () => {
  const manifests = TOOLS.map((t) => manifestFor(t.id)).filter(Boolean);

  it("covers the declared file tools", () => {
    expect(manifests.length).toBeGreaterThan(0);
  });

  it("declares a filter name and at least one accepted extension", () => {
    for (const m of manifests) {
      expect(m!.accept.length, m!.id).toBeGreaterThan(0);
      expect(m!.filterName, m!.id).toBeTruthy();
    }
  });

  it("agrees with the catalogue on accepted extensions", () => {
    for (const m of manifests) {
      expect(toolById(m!.id)!.accept, m!.id).toEqual(m!.accept);
    }
  });

  it("gives every field a default so no control starts undefined", () => {
    for (const m of manifests) {
      const values = defaultValues(m!);
      for (const f of m!.fields) {
        expect(values[f.key], `${m!.id}.${f.key}`).toBeDefined();
      }
    }
  });

  it("uses unique field keys within a tool", () => {
    for (const m of manifests) {
      const keys = m!.fields.map((f) => f.key);
      expect(new Set(keys).size, m!.id).toBe(keys.length);
    }
  });

  it("requires at least one input file", () => {
    for (const m of manifests) expect(m!.minFiles, m!.id).toBeGreaterThanOrEqual(1);
  });
});

/**
 * A tool that declares `accept` is offered as a drop target on the launcher
 * and as a "send to…" target on every matching output. Both hand files over
 * through SourceTray, so a tool that advertises extensions without rendering
 * one accepts the click and then shows an empty tray — which is exactly what
 * seven bespoke tools used to do.
 */
describe("file handoff", () => {
  // Vite's raw glob rather than node's fs, so the test needs no node types
  // and reads exactly what the bundler reads. Two globs because a pattern
  // rooted at the parent skips this file's own directory.
  const raw = {
    ...(import.meta.glob("../**/*.{ts,vue}", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>),
    ...(import.meta.glob("./*.ts", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>),
  };

  /** Keyed src-relative ("work/SourceTray.vue"), whatever prefix Vite used. */
  const sources: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    sources[k.startsWith("./") ? `tools/${k.slice(2)}` : k.replace(/^\.\.\//, "")] = v;
  }

  /** Only application code; a test file naming a local `state` is not a bug. */
  const appSources = Object.entries(sources).filter(([p]) => !p.endsWith(".test.ts"));

  const read = (p: string) => {
    const src = sources[p];
    expect(src, `no source for ${p}`).toBeTruthy();
    return src;
  };

  /** tool id → the view file that implements it, straight from the registry. */
  const bespokePaths = new Map(
    [...read("tools/bespoke.ts").matchAll(/"([^"]+)":\s*\(\)\s*=>\s*import\("\.\.\/([^"]+)"\)/g)]
      .map((m) => [m[1], m[2]] as const),
  );

  it("gives every file-accepting tool some way to receive them", () => {
    // Without this the loop below could pass by checking nothing at all.
    expect(bespokePaths.size).toBe(
      TOOLS.filter((t) => !manifestFor(t.id)).length,
    );

    const missing: string[] = [];
    for (const tool of TOOLS) {
      if (!tool.accept.length) continue;
      if (manifestFor(tool.id)) continue; // ToolRunner renders one for all of these
      const path = bespokePaths.get(tool.id);
      expect(path, tool.id).toBeTruthy();
      // Two ways to receive a batch: the shared source column, or the tool's
      // own panes plus the handoff reader. Anything else opens empty when the
      // launcher routes files to it.
      //
      // Matched as usage, not as text: a plain `includes("SourceTray")` was
      // satisfied by a comment in JsonDiff.vue that said the tool has *no*
      // SourceTray, so the check passed for the one file it should have
      // caught. A guard that a sentence can satisfy is not a guard.
      const src = read(path!);
      const receives = /<SourceTray[\s/>]/.test(src) || /\buseFileHandoff\s*\(/.test(src);
      if (!receives) missing.push(tool.id);
    }
    expect(missing).toEqual([]);
  });

  it("builds route state through the one helper that makes it cloneable", () => {
    // `pushState` structured-clones its argument and a Vue ref hands out
    // Proxies, so putting a reactive list straight into route state throws
    // DataCloneError — which vue-router swallows by falling back to
    // location.assign. The tool then opens empty and nothing says why.
    const offenders = appSources
      .filter(([p]) => p !== "lib/drop.ts")
      .filter(([, src]) => /state:\s*(\{[^}]*files|handoffState)/.test(src))
      .filter(([, src]) => !/state:\s*handoffState\(/.test(src))
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it("reads the handoff in exactly one place", () => {
    // Two consumers of a one-shot value race each other, and the second finds
    // nothing. `lib/drop.ts` owns the read; tools call useFileHandoff.
    const readers = appSources
      .filter(([, src]) => /state[?.]*\.files\b/.test(src))
      .map(([p]) => p);
    expect(readers).toEqual(["lib/drop.ts"]);
  });
});

describe("toolsAccepting", () => {
  it("finds handlers for the formats the app advertises", () => {
    for (const ext of ["pdf", "png", "json", "csv"]) {
      expect(toolsAccepting(ext).length, ext).toBeGreaterThan(0);
    }
  });

  it("is case-insensitive about the extension", () => {
    expect(toolsAccepting("PDF").map((t) => t.id)).toEqual(toolsAccepting("pdf").map((t) => t.id));
  });

  it("returns nothing for an unknown extension", () => {
    expect(toolsAccepting("xyz")).toEqual([]);
  });
});
