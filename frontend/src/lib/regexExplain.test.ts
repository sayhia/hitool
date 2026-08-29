import { describe, expect, it } from "vitest";
import { FLAG_DESC, explain } from "./regexExplain";

const kinds = (p: string) => explain(p).map((t) => t.kind);
const texts = (p: string) => explain(p).map((t) => t.text);

describe("explain", () => {
  it("returns nothing for an empty pattern", () => {
    expect(explain("")).toEqual([]);
  });

  it("reassembles the original source from its tokens", () => {
    const patterns = [
      "\\d{4}-\\d{2}-\\d{2}",
      "(?<user>\\w+)@(?=example)(\\w+)\\.com",
      "^[a-z]+|[A-Z]{2,}$",
      "a(?:bc)*?d",
      "[^\\]]+",
      "\\u4e00-\\u9fa5",
      "(a)\\1",
    ];
    for (const p of patterns) {
      expect(texts(p).join(""), p).toBe(p);
    }
  });

  it("names the common constructs", () => {
    expect(kinds("\\d")).toEqual(["预定义类"]);
    expect(kinds("[a-z]")).toEqual(["字符集"]);
    expect(kinds("^")).toEqual(["锚点"]);
    expect(kinds(".")).toEqual(["通配"]);
    expect(kinds("|")).toEqual(["或"]);
  });

  it("distinguishes the group flavours", () => {
    expect(explain("(?<name>x)")[0]).toMatchObject({ kind: "命名组" });
    expect(explain("(?:x)")[0]).toMatchObject({ kind: "非捕获" });
    expect(explain("(?=x)")[0]).toMatchObject({ kind: "先行" });
    expect(explain("(?!x)")[0]).toMatchObject({ kind: "先行" });
    expect(explain("(?<=x)")[0]).toMatchObject({ kind: "后行" });
    expect(explain("(?<!x)")[0]).toMatchObject({ kind: "后行" });
    expect(explain("(x)")[0]).toMatchObject({ kind: "捕获组" });
  });

  it("reads the three brace-quantifier forms", () => {
    expect(explain("a{3}")[1].desc).toContain("恰好");
    expect(explain("a{3,}")[1].desc).toContain("至少");
    expect(explain("a{3,5}")[1].desc).toContain("到");
  });

  it("flags lazy quantifiers", () => {
    expect(explain("a+?")[1]).toMatchObject({ text: "+?" });
    expect(explain("a+?")[1].desc).toContain("惰性");
    expect(explain("a{2,3}?")[1].text).toBe("{2,3}?");
  });

  it("separates negated from plain character sets", () => {
    expect(explain("[^a]")[0].desc).toContain("之外");
    expect(explain("[a]")[0].desc).not.toContain("之外");
  });

  it("keeps an escaped closing bracket inside the set", () => {
    expect(explain("[\\]x]")[0].text).toBe("[\\]x]");
  });

  it("recognises back-references, numbered and named", () => {
    expect(explain("(a)\\1")[3]).toMatchObject({ kind: "反向引用", text: "\\1" });
    expect(explain("\\k<n>")[0]).toMatchObject({ kind: "反向引用", text: "\\k<n>" });
  });

  it("groups consecutive plain characters into one literal token", () => {
    const t = explain("abc\\d");
    expect(t[0]).toMatchObject({ kind: "字面量", text: "abc" });
    expect(t).toHaveLength(2);
  });

  it("treats a lone trailing backslash as a literal instead of throwing", () => {
    expect(() => explain("abc\\")).not.toThrow();
    expect(texts("abc\\").join("")).toBe("abc\\");
  });

  it("treats a brace that is not a quantifier as literal text", () => {
    expect(texts("a{b}").join("")).toBe("a{b}");
  });

  it("documents every flag the tester exposes", () => {
    for (const f of ["g", "i", "m", "s"]) {
      expect(FLAG_DESC[f], f).toBeTruthy();
    }
  });
});
