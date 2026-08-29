import { describe, expect, it } from "vitest";
import {
  canonical,
  diffJson,
  filterByPath,
  preview,
  summarise,
  typeName,
} from "./jsonDiff";

const shape = (a: unknown, b: unknown) =>
  diffJson(a, b).map((c) => `${c.kind} ${c.path}`);

describe("typeName", () => {
  it("separates null and array from object", () => {
    expect(typeName(null)).toBe("null");
    expect(typeName([])).toBe("array");
    expect(typeName({})).toBe("object");
    expect(typeName(1)).toBe("number");
    expect(typeName("x")).toBe("string");
    expect(typeName(true)).toBe("boolean");
  });
});

describe("canonical", () => {
  it("is blind to key order", () => {
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }));
  });

  it("is not blind to array order", () => {
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
  });

  it("sorts keys at every depth", () => {
    expect(canonical({ x: { a: 1, b: 2 } })).toBe(canonical({ x: { b: 2, a: 1 } }));
  });

  it("keeps values of different types apart", () => {
    expect(canonical(1)).not.toBe(canonical("1"));
    expect(canonical(null)).not.toBe(canonical("null"));
  });
});

describe("diffJson — objects", () => {
  it("finds nothing between equal documents", () => {
    expect(diffJson({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toEqual([]);
  });

  it("ignores key order", () => {
    // The whole reason not to reach for the text diff.
    expect(diffJson({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
  });

  it("reports an added and a removed key", () => {
    expect(shape({ a: 1 }, { b: 2 })).toEqual(["remove $['a']", "add $['b']"]);
  });

  it("reports a changed value with both sides", () => {
    expect(diffJson({ a: 1 }, { a: 2 })).toEqual([
      { path: "$['a']", kind: "change", left: 1, right: 2 },
    ]);
  });

  it("separates a type change from a value change", () => {
    const [c] = diffJson({ a: 1 }, { a: "1" });
    expect(c.kind).toBe("type");
    expect(c.left).toBe(1);
    expect(c.right).toBe("1");
  });

  it("does not descend past a type change", () => {
    // Reporting every key of the object as removed says nothing useful.
    expect(shape({ a: { x: 1, y: 2 } }, { a: null })).toEqual(["type $['a']"]);
  });

  it("recurses into nested objects", () => {
    expect(shape({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })).toEqual(["change $['a']['b']['c']"]);
  });

  it("treats a missing key and an explicit null as different", () => {
    expect(shape({ a: 1 }, { a: 1, b: null })).toEqual(["add $['b']"]);
    expect(shape({ a: 1, b: null }, { a: 1 })).toEqual(["remove $['b']"]);
  });

  it("emits paths that jsonpath can read back", () => {
    const [c] = diffJson({ "odd key": [{ n: 1 }] }, { "odd key": [{ n: 2 }] });
    expect(c.path).toBe("$['odd key'][0]['n']");
  });
});

describe("diffJson — arrays", () => {
  it("reports an appended item", () => {
    expect(shape([1, 2], [1, 2, 3])).toEqual(["add $[2]"]);
  });

  it("reports a removed tail item", () => {
    expect(shape([1, 2, 3], [1, 2])).toEqual(["remove $[2]"]);
  });

  it("reports one changed item, not a whole shifted array", () => {
    expect(shape([1, 2, 3], [1, 9, 3])).toEqual(["change $[1]"]);
  });

  it("anchors on unmoved items when one is inserted at the front", () => {
    // Index-by-index comparison calls all four positions changed.
    expect(shape([1, 2, 3], [0, 1, 2, 3])).toEqual(["add $[0]"]);
  });

  it("anchors on unmoved items when one is removed from the front", () => {
    expect(shape([0, 1, 2, 3], [1, 2, 3])).toEqual(["remove $[0]"]);
  });

  it("descends into an object item that was edited in place", () => {
    const a = [{ id: 1, n: "a" }, { id: 2, n: "b" }];
    const b = [{ id: 1, n: "a" }, { id: 2, n: "B" }];
    expect(shape(a, b)).toEqual(["change $[1]['n']"]);
  });

  it("pairs an edited item positionally between two anchors", () => {
    // The edited middle item must read as an edit, not as remove plus add.
    const a = [{ k: 1 }, { k: 2 }, { k: 3 }];
    const b = [{ k: 1 }, { k: 22 }, { k: 3 }];
    expect(shape(a, b)).toEqual(["change $[1]['k']"]);
  });

  it("reports a reordering rather than pretending it is nothing", () => {
    // Arrays are ordered; swapping two items is a real difference.
    expect(diffJson([1, 2], [2, 1]).length).toBeGreaterThan(0);
  });

  it("handles both sides being empty", () => {
    expect(diffJson([], [])).toEqual([]);
    expect(shape([], [1])).toEqual(["add $[0]"]);
    expect(shape([1], [])).toEqual(["remove $[0]"]);
  });

  it("does not confuse an array with an object", () => {
    expect(shape({ 0: "a" }, ["a"])).toEqual(["type $"]);
  });
});

describe("diffJson — top level", () => {
  it("compares two primitives", () => {
    expect(diffJson(1, 2)).toEqual([{ path: "$", kind: "change", left: 1, right: 2 }]);
    expect(diffJson("a", "a")).toEqual([]);
  });

  it("reports a whole-document type change once", () => {
    expect(shape({ a: 1 }, [1])).toEqual(["type $"]);
  });

  it("treats null against null as equal", () => {
    expect(diffJson(null, null)).toEqual([]);
  });
});

describe("diffJson — size", () => {
  it("stops well before a report nobody can read", () => {
    const a = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`k${i}`, i]));
    const b = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`k${i}`, i + 1]));
    const changes = diffJson(a, b);
    expect(changes.length).toBeLessThanOrEqual(2000);
    expect(summarise(changes).truncated).toBe(true);
  });

  it("compares a long array by index rather than tabling it", () => {
    // The anchor table is O(n·m); past the limit the report is still correct,
    // just less clever about insertions.
    const a = Array.from({ length: 600 }, (_, i) => i);
    const b = Array.from({ length: 600 }, (_, i) => (i === 599 ? -1 : i));
    expect(shape(a, b)).toEqual(["change $[599]"]);
  });

  it("does not flag truncation for an ordinary document", () => {
    expect(summarise(diffJson({ a: 1 }, { a: 2 })).truncated).toBe(false);
  });
});

describe("summarise", () => {
  it("counts each kind, with type changes counting as changes", () => {
    const s = summarise(diffJson({ a: 1, b: 2, c: 3 }, { a: 9, b: "2", d: 4 }));
    expect(s.added).toBe(1);
    expect(s.removed).toBe(1);
    expect(s.changed).toBe(2);
  });
});

describe("preview", () => {
  it("renders values as JSON", () => {
    expect(preview({ a: 1 })).toBe('{"a":1}');
    expect(preview("x")).toBe('"x"');
    expect(preview(null)).toBe("null");
  });

  it("returns empty for a side that does not exist", () => {
    expect(preview(undefined)).toBe("");
  });

  it("truncates a long value", () => {
    const s = preview("x".repeat(300), 20);
    expect(s).toHaveLength(21);
    expect(s.endsWith("…")).toBe(true);
  });
});

describe("filterByPath", () => {
  const changes = diffJson(
    { a: 1, ab: 2, data: { items: [{ n: 1 }, { n: 2 }], total: 3 } },
    { a: 9, ab: 8, data: { items: [{ n: 1 }, { n: 7 }], total: 4 } },
  );
  const paths = (q: string) => filterByPath(changes, q).map((c) => c.path);

  it("returns everything for an empty query", () => {
    expect(filterByPath(changes, "")).toBe(changes);
    expect(filterByPath(changes, "   ")).toBe(changes);
  });

  it("keeps a subtree and nothing beside it", () => {
    // The trap: "starts with $['a']" would drag in $['ab'] as well.
    expect(paths("$['a']")).toEqual(["$['a']"]);
    expect(paths("$['ab']")).toEqual(["$['ab']"]);
  });

  it("keeps everything below a subtree", () => {
    expect(paths("$['data']")).toEqual(["$['data']['items'][1]['n']", "$['data']['total']"]);
  });

  it("narrows to an array element", () => {
    expect(paths("$['data']['items'][1]")).toEqual(["$['data']['items'][1]['n']"]);
  });

  it("treats a bare word as a fragment of the path", () => {
    expect(paths("items")).toEqual(["$['data']['items'][1]['n']"]);
    expect(paths("total")).toEqual(["$['data']['total']"]);
  });

  it("keeps the whole report for the root", () => {
    expect(paths("$")).toHaveLength(changes.length);
  });

  it("returns nothing when the subtree has no differences", () => {
    expect(paths("$['nope']")).toEqual([]);
    expect(paths("zzz")).toEqual([]);
  });
});
