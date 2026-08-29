import { describe, expect, it } from "vitest";
import { LANGS, convert } from "./jsonToCode";

const SAMPLE = JSON.stringify({
  id: 42,
  name: "Ada",
  score: 9.5,
  active: true,
  tags: ["a", "b"],
  meta: null,
  address: { city: "Beijing", zip: "100000" },
  items: [
    { sku: "x1", qty: 2 },
    { sku: "x2", qty: 1, note: "extra" },
  ],
});

describe("convert", () => {
  it("puts the root type first and nested types after it", () => {
    const go = convert(SAMPLE, "go", "User", "");
    expect(go.indexOf("type User struct")).toBeLessThan(go.indexOf("type Address struct"));
  });

  it("aligns Go struct columns the way gofmt would", () => {
    const go = convert(SAMPLE, "go", "User", "");
    const rows = go
      .split("\n")
      .filter((l) => l.startsWith("\t") && l.includes("`json:"))
      .map((l) => l.indexOf("`json:"));
    // Every tag in a struct starts at the same column.
    expect(new Set(rows.slice(0, 8)).size).toBe(1);
  });

  it("infers scalar types from the sample", () => {
    const go = convert(SAMPLE, "go", "User", "");
    expect(go).toContain("Id      int");
    expect(go).toContain("Score   float64");
    expect(go).toContain("Active  bool");
    expect(go).toContain("Tags    []string");
  });

  it("unions object fields across array elements", () => {
    // `note` only exists on the second item; it must not be dropped.
    for (const lang of LANGS) {
      const out = convert(SAMPLE, lang.id, "User", "pkg");
      expect(out.toLowerCase(), lang.label).toContain("note");
    }
  });

  it("marks a null field nullable per language", () => {
    expect(convert(SAMPLE, "csharp", "User", "N")).toMatch(/object\??\s+Meta/);
    expect(convert(SAMPLE, "rust", "User", "")).toContain("serde_json::Value");
    // TypeScript's `unknown` already admits null, so it isn't widened further.
    expect(convert(SAMPLE, "ts", "User", "")).toContain("meta: unknown;");
  });

  it("keeps the original JSON key in the serialisation tag", () => {
    const snake = JSON.stringify({ user_name: "a", created_at: 1 });
    const go = convert(snake, "go", "Row", "");
    expect(go).toContain("UserName");
    expect(go).toContain('`json:"user_name"`');
  });

  it("quotes TypeScript keys that are not valid identifiers", () => {
    const odd = JSON.stringify({ "content-type": "json", ok: true });
    const ts = convert(odd, "ts", "Head", "");
    expect(ts).toContain('"content-type":');
    expect(ts).toContain("ok:");
  });

  it("snake_cases Rust fields and renames when they differ", () => {
    const rust = convert(JSON.stringify({ userName: "a" }), "rust", "Row", "");
    expect(rust).toContain("pub user_name:");
    expect(rust).toContain('#[serde(rename = "userName")]');
  });

  it("emits the package or namespace only where it belongs", () => {
    expect(convert(SAMPLE, "java", "User", "com.example")).toContain("package com.example;");
    expect(convert(SAMPLE, "csharp", "User", "Acme")).toContain("namespace Acme;");
    expect(convert(SAMPLE, "go", "User", "ignored")).not.toContain("ignored");
  });

  it("takes an array at the root as a list of its element type", () => {
    const arr = JSON.stringify([{ a: 1 }, { a: 2, b: "x" }]);
    const go = convert(arr, "go", "Row", "");
    expect(go).toContain("type Row struct");
    expect(go).toContain("A int");
    expect(go).toContain("B string");
  });

  it("sanitises names that cannot be identifiers", () => {
    const weird = JSON.stringify({ "2fa": true, "a-b": 1 });
    const go = convert(weird, "go", "Row", "");
    expect(go).not.toMatch(/^\t2fa/m);
    expect(go).toContain('`json:"2fa"`');
  });

  it("throws on malformed JSON rather than emitting junk", () => {
    expect(() => convert("{bad", "go", "Row", "")).toThrow();
  });

  it("handles an empty object without crashing", () => {
    for (const lang of LANGS) {
      expect(() => convert("{}", lang.id, "Empty", "p"), lang.label).not.toThrow();
    }
  });
});
