import { describe, expect, it } from "vitest";
import { csvToObjects, flattenRecord, objectsToCsv, unflattenRecord } from "./jsonCsv";

describe("flattenRecord", () => {
  it("flattens nested objects into dot paths", () => {
    expect(
      flattenRecord({ id: 1, user: { name: "Ada", addr: { city: "London" } } }),
    ).toEqual({ id: "1", "user.name": "Ada", "user.addr.city": "London" });
  });

  it("serialises arrays as JSON text", () => {
    expect(flattenRecord({ tags: ["a", "b"] })).toEqual({ tags: '["a","b"]' });
  });

  it("treats null as an empty cell", () => {
    expect(flattenRecord({ a: null, b: undefined })).toEqual({ a: "", b: "" });
  });
});

describe("objectsToCsv", () => {
  it("unions headers in first-seen order and pads missing cells", () => {
    const csvText = objectsToCsv([{ a: 1, b: 2 }, { b: 3, c: 4 }]);
    expect(csvText).toBe("a,b,c\n1,2,\n,3,4");
  });

  it("quotes fields containing delimiters", () => {
    expect(objectsToCsv([{ name: "Smith, John", n: 1 }])).toBe('name,n\n"Smith, John",1');
  });

  it("returns empty text for an empty array and throws on non-arrays", () => {
    expect(objectsToCsv([])).toBe("");
    expect(() => objectsToCsv({ a: 1 } as unknown as unknown[])).toThrow();
  });

  it("honours a custom delimiter", () => {
    expect(objectsToCsv([{ a: 1, b: 2 }], { delimiter: "\t" })).toBe("a\tb\n1\t2");
  });
});

describe("csvToObjects", () => {
  it("rebuilds nested objects from dot-path headers", () => {
    const rows = csvToObjects("id,user.name,user.addr.city\n1,Ada,London");
    expect(rows).toEqual([{ id: 1, user: { name: "Ada", addr: { city: "London" } } }]);
  });

  it("coerces booleans and numbers but keeps lookalikes as strings", () => {
    const [row] = csvToObjects('n,b,s\n1,true,007');
    expect(row.n).toBe(1);
    expect(row.b).toBe(true);
    expect(row.s).toBe("007");
  });

  it("returns nothing for header-only input", () => {
    expect(csvToObjects("a,b\n")).toEqual([]);
    expect(csvToObjects("")).toEqual([]);
  });
});

describe("round trip", () => {
  it("restores nesting through CSV", () => {
    const src = [
      { id: 1, user: { name: "Ada", city: "London" }, active: true },
      { id: 2, user: { name: "Bo", city: "Oslo" }, active: false },
    ];
    const back = csvToObjects(objectsToCsv(src));
    expect(back).toEqual([
      { id: 1, user: { name: "Ada", city: "London" }, active: true },
      { id: 2, user: { name: "Bo", city: "Oslo" }, active: false },
    ]);
  });

  it("unflattenRecord overwrites scalar collisions with branches", () => {
    expect(unflattenRecord({ "a.b": 1, a: "x" })).toEqual({ a: { b: 1 } });
  });
});
