import { describe, expect, it } from "vitest";
import { detectFormat, parseAs, stringifyAs } from "./dataConvert";

describe("detectFormat", () => {
  it("spots JSON by its braces", () => {
    expect(detectFormat('{"a": 1}')).toBe("json");
    expect(detectFormat("[1, 2]")).toBe("json");
  });

  it("spots TOML by its assignments", () => {
    expect(detectFormat('title = "hi"\n[db]\nport = 5432')).toBe("toml");
  });

  it("falls back to YAML", () => {
    expect(detectFormat("a: 1\nb:\n  - x")).toBe("yaml");
  });

  it("returns null for nothing", () => {
    expect(detectFormat("")).toBeNull();
  });
});

describe("round trips", () => {
  const sample = { name: "hi", count: 3, nested: { on: true, tags: ["a", "b"] } };

  it("json -> yaml -> toml -> json keeps the data", () => {
    const yamlText = stringifyAs(sample, "yaml");
    const fromYaml = parseAs(yamlText, "yaml");
    const tomlText = stringifyAs(fromYaml, "toml");
    const fromToml = parseAs(tomlText, "toml");
    expect(fromToml).toEqual(sample);
  });

  it("pretty-prints JSON with two spaces", () => {
    expect(stringifyAs({ a: 1 }, "json")).toBe('{\n  "a": 1\n}');
  });

  it("rejects non-table TOML roots", () => {
    expect(() => stringifyAs([1, 2], "toml")).toThrow(/table/i);
    expect(() => stringifyAs(null, "toml")).toThrow(/table/i);
  });

  it("propagates parse errors", () => {
    expect(() => parseAs("{bad json", "json")).toThrow();
    expect(() => parseAs("a = = 2", "toml")).toThrow();
  });
});
