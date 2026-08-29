import { describe, expect, it } from "vitest";
import { preview, query } from "./jsonpath";

const store = {
  store: {
    book: [
      { category: "reference", author: "Nigel Rees", title: "Sayings", price: 8.95 },
      { category: "fiction", author: "Evelyn Waugh", title: "Sword of Honour", price: 12.99 },
      { category: "fiction", author: "Herman Melville", title: "Moby Dick", price: 8.99, isbn: "0-553-21311-3" },
      { category: "fiction", author: "J. R. R. Tolkien", title: "The Lord of the Rings", price: 22.99, isbn: "0-395-19395-8" },
    ],
    bicycle: { color: "red", price: 19.95 },
  },
  expensive: 10,
};

const values = (expr: string, data: unknown = store) => query(data, expr).matches.map((m) => m.value);
const paths = (expr: string, data: unknown = store) => query(data, expr).matches.map((m) => m.path);

describe("jsonpath — child access", () => {
  it("returns the whole document for $", () => {
    expect(values("$")).toEqual([store]);
  });

  it("walks dotted names", () => {
    expect(values("$.store.bicycle.color")).toEqual(["red"]);
  });

  it("accepts bracket-quoted names", () => {
    expect(values("$['store']['bicycle']['color']")).toEqual(["red"]);
  });

  it("tolerates a leading name without $", () => {
    expect(values("expensive")).toEqual([10]);
    expect(values("store.bicycle.price")).toEqual([19.95]);
  });

  it("returns nothing for a missing key rather than undefined entries", () => {
    expect(values("$.store.nope.deeper")).toEqual([]);
  });

  it("does not walk into arrays with a name", () => {
    expect(values("$.store.book.title")).toEqual([]);
  });
});

describe("jsonpath — indices and slices", () => {
  it("indexes an array", () => {
    expect(values("$.store.book[0].title")).toEqual(["Sayings"]);
  });

  it("counts back from the end for a negative index", () => {
    expect(values("$.store.book[-1].title")).toEqual(["The Lord of the Rings"]);
    expect(values("$.store.book[-2].title")).toEqual(["Moby Dick"]);
  });

  it("drops an out-of-range index instead of yielding undefined", () => {
    expect(values("$.store.book[99]")).toEqual([]);
    expect(values("$.store.book[-99]")).toEqual([]);
  });

  it("slices with Python semantics", () => {
    expect(values("$.store.book[1:3].title")).toEqual(["Sword of Honour", "Moby Dick"]);
    expect(values("$.store.book[:2].title")).toEqual(["Sayings", "Sword of Honour"]);
    expect(values("$.store.book[2:].title")).toEqual(["Moby Dick", "The Lord of the Rings"]);
  });

  it("honours a slice step, including a negative one", () => {
    expect(values("$.store.book[::2].title")).toEqual(["Sayings", "Moby Dick"]);
    expect(values("$.store.book[::-1].title")).toEqual([
      "The Lord of the Rings",
      "Moby Dick",
      "Sword of Honour",
      "Sayings",
    ]);
  });

  it("rejects a zero step rather than looping forever", () => {
    expect(query(store, "$.store.book[::0]").error).toBeTruthy();
  });

  it("takes a union of indices and of names", () => {
    expect(values("$.store.book[0,2].title")).toEqual(["Sayings", "Moby Dick"]);
    expect(values("$.store.bicycle['color','price']")).toEqual(["red", 19.95]);
  });
});

describe("jsonpath — wildcards and descent", () => {
  it("expands a wildcard over arrays and objects alike", () => {
    expect(values("$.store.book[*].price")).toEqual([8.95, 12.99, 8.99, 22.99]);
    expect(values("$.store.bicycle.*")).toEqual(["red", 19.95]);
  });

  it("finds a key at any depth", () => {
    expect(values("$..color")).toEqual(["red"]);
    expect(values("$..price")).toEqual([8.95, 12.99, 8.99, 22.99, 19.95]);
  });

  it("finds a key that only some siblings have", () => {
    expect(values("$..isbn")).toEqual(["0-553-21311-3", "0-395-19395-8"]);
  });

  it("descends into indices too", () => {
    expect(values("$..book[0].title")).toEqual(["Sayings"]);
  });

  it("reports the real location of each hit", () => {
    expect(paths("$..isbn")).toEqual(["$['store']['book'][2]['isbn']", "$['store']['book'][3]['isbn']"]);
  });

  it("never reports the same node twice", () => {
    const p = paths("$..*");
    expect(new Set(p).size).toBe(p.length);
  });
});

describe("jsonpath — filters", () => {
  it("compares numbers", () => {
    expect(values("$.store.book[?(@.price < 9)].title")).toEqual(["Sayings", "Moby Dick"]);
    expect(values("$.store.book[?(@.price >= 12.99)].title")).toEqual([
      "Sword of Honour",
      "The Lord of the Rings",
    ]);
  });

  it("compares strings for equality", () => {
    expect(values("$.store.book[?(@.category == 'reference')].title")).toEqual(["Sayings"]);
    expect(values("$.store.book[?(@.category != 'fiction')].title")).toEqual(["Sayings"]);
  });

  it("tests for the presence of a field", () => {
    expect(values("$.store.book[?(@.isbn)].title")).toEqual(["Moby Dick", "The Lord of the Rings"]);
  });

  it("matches with a regular expression", () => {
    expect(values("$.store.book[?(@.author =~ ^J)].title")).toEqual(["The Lord of the Rings"]);
  });

  it("does not order-compare across types", () => {
    // "8.95" < 9 is a JavaScript coercion trap; JSONPath should not fall into it.
    expect(values("$.store.book[?(@.title < 9)]")).toEqual([]);
  });

  it("works without the optional parentheses", () => {
    expect(values("$.store.book[?@.price < 9].title")).toEqual(["Sayings", "Moby Dick"]);
  });

  it("combines with descent", () => {
    expect(values("$..book[?(@.price > 20)].author")).toEqual(["J. R. R. Tolkien"]);
  });
});

describe("jsonpath — malformed input", () => {
  it("reports rather than throws", () => {
    for (const bad of ["", "$[", "$..", "$.", "$['unterminated]"]) {
      const r = query(store, bad);
      expect(r.error, bad).toBeTruthy();
      expect(r.matches).toEqual([]);
    }
  });

  it("survives being pointed at a non-object", () => {
    expect(query(null, "$.a").matches).toEqual([]);
    expect(query(42, "$..x").matches).toEqual([]);
    expect(query("text", "$[0]").matches).toEqual([]);
  });

  it("never runs code from a script expression", () => {
    // No `[(...)]` support at all — it must fail closed, not evaluate.
    const r = query(store, "$.store.book[(@.length-1)]");
    expect(r.matches).toEqual([]);
  });
});

describe("preview", () => {
  it("quotes strings so an empty one is visible", () => {
    expect(preview("")).toBe('""');
    expect(preview("hi")).toBe('"hi"');
  });

  it("truncates long values with an ellipsis", () => {
    const out = preview({ a: "x".repeat(200) }, 30);
    expect(out.length).toBe(30);
    expect(out.endsWith("…")).toBe(true);
  });

  it("renders primitives and containers", () => {
    expect(preview(null)).toBe("null");
    expect(preview(12)).toBe("12");
    expect(preview([1, 2])).toBe("[1,2]");
  });
});
