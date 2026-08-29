import { describe, expect, it } from "vitest";
import { EXTENSIONS, highlight } from "./highlight";
import { LANGS, convert } from "./jsonToCode";

const join = (code: string, lang: string) =>
  highlight(code, lang)
    .map((t) => t.text)
    .join("");

describe("highlight", () => {
  it("is lossless — tokens always reassemble the input", () => {
    const sample = JSON.stringify({ id: 1, name: "a", nested: { x: true }, list: [1, 2] });
    for (const lang of LANGS) {
      const code = convert(sample, lang.id, "Root", "pkg");
      expect(join(code, lang.id), lang.label).toBe(code);
    }
  });

  it("classifies Go keywords, types and struct tags", () => {
    const toks = highlight('type User struct {\n\tName string `json:"name"`\n}', "go");
    const cls = (text: string) => toks.find((t) => t.text === text)?.cls;
    expect(cls("type")).toBe("kw");
    expect(cls("struct")).toBe("kw");
    expect(cls("string")).toBe("type");
    expect(toks.some((t) => t.cls === "attr" && t.text.includes("json:"))).toBe(true);
  });

  it("treats a double-quoted run as one string token", () => {
    const toks = highlight('a = "hello world"', "ts");
    expect(toks.some((t) => t.cls === "str" && t.text === '"hello world"')).toBe(true);
  });

  it("does not end a string on an escaped quote", () => {
    const src = 'x = "a\\"b" y';
    expect(join(src, "ts")).toBe(src);
    const toks = highlight(src, "ts");
    expect(toks.find((t) => t.cls === "str")?.text).toBe('"a\\"b"');
  });

  it("marks line comments through to the newline only", () => {
    const toks = highlight("// note\ncode", "go");
    expect(toks[0]).toMatchObject({ cls: "com", text: "// note" });
    expect(toks.some((t) => t.text.includes("code") && t.cls === "")).toBe(true);
  });

  it("recognises annotations and attributes per language", () => {
    expect(highlight("@JsonProperty(\"a\")", "java").some((t) => t.cls === "attr")).toBe(true);
    expect(highlight("#[derive(Debug)]", "rust").some((t) => t.cls === "attr")).toBe(true);
    expect(
      highlight('[JsonPropertyName("a")]', "csharp").some((t) => t.cls === "attr"),
    ).toBe(true);
  });

  it("does not treat digits inside an identifier as a number", () => {
    const toks = highlight("var x2 = 5", "ts");
    expect(toks.find((t) => t.cls === "num")?.text).toBe("5");
    expect(toks.some((t) => t.cls === "num" && t.text === "2")).toBe(false);
  });

  it("returns a single plain token for unknown languages", () => {
    const toks = highlight("plain text", "cobol");
    expect(join("plain text", "cobol")).toBe("plain text");
    expect(toks.every((t) => t.cls === "" || t.cls === "num")).toBe(true);
  });

  it("handles empty input", () => {
    expect(highlight("", "go")).toEqual([]);
  });
});

describe("EXTENSIONS", () => {
  it("covers every language the converter offers", () => {
    for (const l of LANGS) {
      expect(EXTENSIONS[l.id], l.label).toMatch(/^\.\w+$/);
    }
  });
});
