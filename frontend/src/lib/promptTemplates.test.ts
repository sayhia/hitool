import { describe, expect, it } from "vitest";
import {
  addTemplate,
  allTemplates,
  builtinTemplates,
  normalizeTemplates,
  removeTemplate,
  validateTemplate,
} from "./promptTemplates";

describe("builtinTemplates", () => {
  it("is bilingual and marked builtin", () => {
    const zh = builtinTemplates("zh");
    const en = builtinTemplates("en");
    expect(zh.length).toBeGreaterThanOrEqual(8);
    expect(zh.length).toBe(en.length);
    expect(zh.every((t) => t.builtin)).toBe(true);
    expect(zh.every((t) => t.id.startsWith("b-"))).toBe(true);
    // Same ids across languages, different display text.
    expect(zh.map((t) => t.id)).toEqual(en.map((t) => t.id));
    expect(zh[0].name).not.toBe(en[0].name);
  });
});

describe("validateTemplate", () => {
  const user = [{ id: "u1", name: "我的模板", body: "body" }];

  it("requires name and body", () => {
    expect(validateTemplate(user, "  ", "x", "zh")).toBe("noName");
    expect(validateTemplate(user, "名字", "   ", "zh")).toBe("noBody");
  });

  it("rejects duplicates against user and builtin names", () => {
    expect(validateTemplate(user, "我的模板", "x", "zh")).toBe("dupUser");
    expect(validateTemplate(user, "总结要点", "x", "zh")).toBe("dupBuiltin");
    expect(validateTemplate(user, "Summarise", "x", "en")).toBe("dupBuiltin");
  });

  it("accepts a fresh name", () => {
    expect(validateTemplate(user, "全新", "x", "zh")).toBeNull();
  });
});

describe("add / remove", () => {
  it("appends with trimmed name and removes by id", () => {
    const one = addTemplate([], "u1", " 名字 ", "body");
    expect(one[0].name).toBe("名字");
    expect(removeTemplate(one, "u1")).toEqual([]);
    expect(removeTemplate(one, "zz")).toHaveLength(1);
  });
});

describe("allTemplates", () => {
  it("puts built-ins first, then user templates", () => {
    const user = [{ id: "u1", name: "custom", body: "b" }];
    const all = allTemplates(user, "zh");
    expect(all[all.length - 1].id).toBe("u1");
    expect(all.slice(0, -1).every((t) => t.builtin)).toBe(true);
  });
});

describe("normalizeTemplates", () => {
  it("drops rows missing id, name or body", () => {
    const out = normalizeTemplates([
      { id: "a", name: "n", body: "b" },
      { id: "b", name: "", body: "b" },
      { id: "c", name: "n" },
      null,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a");
  });

  it("returns [] for garbage", () => {
    expect(normalizeTemplates(undefined)).toEqual([]);
    expect(normalizeTemplates("x")).toEqual([]);
  });
});
