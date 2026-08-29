import { describe, expect, it } from "vitest";
import {
  columnStats,
  detectDelimiter,
  parse,
  rectangular,
  selectColumns,
  stringify,
  toJson,
  toMarkdown,
  transpose,
  width,
} from "./csv";

describe("parse", () => {
  it("reads a plain table", () => {
    expect(parse("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a delimiter that sits inside quotes", () => {
    // The failure this parser exists for: splitting shifts every later column.
    expect(parse('name,age\n"Smith, John",42')).toEqual([
      ["name", "age"],
      ["Smith, John", "42"],
    ]);
  });

  it("keeps a newline inside quotes", () => {
    expect(parse('a,b\n"line1\nline2",2')).toEqual([
      ["a", "b"],
      ["line1\nline2", "2"],
    ]);
  });

  it("unescapes a doubled quote", () => {
    expect(parse('a\n"He said ""hi"""')).toEqual([["a"], ['He said "hi"']]);
  });

  it("handles an empty field, and a row of them", () => {
    expect(parse("a,,c")).toEqual([["a", "", "c"]]);
    expect(parse(",,")).toEqual([["", "", ""]]);
  });

  it("treats a final newline as a terminator", () => {
    expect(parse("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a genuinely blank row in the middle", () => {
    expect(parse("a\n\nb")).toEqual([["a"], [""], ["b"]]);
  });

  it("handles CRLF", () => {
    expect(parse("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a UTF-8 BOM", () => {
    expect(parse("﻿a,b")).toEqual([["a", "b"]]);
  });

  it("accepts a ragged table rather than refusing it", () => {
    expect(parse("a,b,c\n1,2")).toEqual([
      ["a", "b", "c"],
      ["1", "2"],
    ]);
  });

  it("reads tab-separated input", () => {
    expect(parse("a\tb\n1\t2", "\t")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parse("")).toEqual([]);
  });

  it("does not treat a quote inside an unquoted field as a quote", () => {
    // Only a quote at the *start* of a field opens one.
    expect(parse('a,b"c')).toEqual([["a", 'b"c']]);
  });

  it("closes an unterminated quoted field at the end of the text", () => {
    expect(parse('a,"unfinished')).toEqual([["a", "unfinished"]]);
  });
});

describe("detectDelimiter", () => {
  it("finds the obvious one", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a|b|c\n1|2|3")).toBe("|");
  });

  it("ignores candidates that sit inside quotes", () => {
    // Counting blindly picks the comma here, which is the one character that
    // is not the delimiter.
    expect(detectDelimiter('"Smith, John";42;x\n"Doe, J";7;y')).toBe(";");
  });

  it("falls back to a comma when there is nothing to go on", () => {
    expect(detectDelimiter("just one column")).toBe(",");
    expect(detectDelimiter("")).toBe(",");
  });
});

describe("stringify", () => {
  it("round-trips a plain table", () => {
    const rows = [
      ["a", "b"],
      ["1", "2"],
    ];
    expect(parse(stringify(rows))).toEqual(rows);
  });

  it("quotes only the fields that need it", () => {
    expect(stringify([["plain", "with,comma"]])).toBe('plain,"with,comma"');
    expect(stringify([["a"], ["b"]])).toBe("a\nb");
  });

  it("quotes a field containing a quote or a newline", () => {
    expect(stringify([['say "hi"']])).toBe('"say ""hi"""');
    expect(stringify([["two\nlines"]])).toBe('"two\nlines"');
  });

  it("round-trips everything awkward", () => {
    const rows = [
      ["name", "note"],
      ["Smith, John", 'He said "hi"'],
      ["multi\nline", ""],
      ["", "trailing "],
    ];
    for (const d of [",", "\t", ";", "|"] as const) {
      expect(parse(stringify(rows, d), d), d).toEqual(rows);
    }
  });
});

describe("shape helpers", () => {
  it("measures the widest row", () => {
    expect(width([["a"], ["a", "b", "c"]])).toBe(3);
    expect(width([])).toBe(0);
  });

  it("pads short rows", () => {
    expect(rectangular([["a"], ["b", "c"]])).toEqual([
      ["a", ""],
      ["b", "c"],
    ]);
  });

  it("transposes, padding first", () => {
    expect(transpose([["a", "b"], ["1"]])).toEqual([
      ["a", "1"],
      ["b", ""],
    ]);
  });

  it("selects columns in the order given", () => {
    const rows = [
      ["a", "b", "c"],
      ["1", "2", "3"],
    ];
    expect(selectColumns(rows, [2, 0])).toEqual([
      ["c", "a"],
      ["3", "1"],
    ]);
  });

  it("fills a selected column that does not exist", () => {
    expect(selectColumns([["a"]], [0, 5])).toEqual([["a", ""]]);
  });
});

describe("toJson", () => {
  it("uses the first row as keys", () => {
    expect(toJson(parse("name,age\nAda,36"), { header: true })).toEqual([
      { name: "Ada", age: "36" },
    ]);
  });

  it("returns rows of values without a header", () => {
    expect(toJson(parse("a,b\n1,2"))).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("names an unnamed column rather than dropping it", () => {
    const out = toJson(parse("name,,age\nAda,x,36"), { header: true }) as Record<string, string>[];
    expect(Object.keys(out[0])).toEqual(["name", "column2", "age"]);
  });

  it("coerces numbers and booleans when asked", () => {
    expect(toJson(parse("a,b,c\n1,true,x"), { header: true, coerce: true })).toEqual([
      { a: 1, b: true, c: "x" },
    ]);
  });

  it("leaves a value that would not round-trip as a string", () => {
    // "007" is an id, not the number seven; 1e999 is not Infinity.
    const out = toJson(parse("id,big,pad\n007,1e999,1.50"), {
      header: true,
      coerce: true,
    }) as Record<string, unknown>[];
    expect(out[0]).toEqual({ id: "007", big: "1e999", pad: "1.50" });
  });

  it("pads a short row so every object has every key", () => {
    const out = toJson(parse("a,b\n1"), { header: true }) as Record<string, string>[];
    expect(out[0]).toEqual({ a: "1", b: "" });
  });

  it("handles an empty table", () => {
    expect(toJson([])).toEqual([]);
  });
});

describe("toMarkdown", () => {
  it("writes a pipe table", () => {
    expect(toMarkdown(parse("a,b\n1,2"))).toBe("| a | b |\n| --- | --- |\n| 1 | 2 |");
  });

  it("invents column names when there is no header row", () => {
    expect(toMarkdown(parse("1,2"), false)).toContain("| 列1 | 列2 |");
  });

  it("escapes a pipe inside a cell", () => {
    // Otherwise one cell silently becomes two.
    expect(toMarkdown([["a|b"]])).toContain("a\\|b");
  });

  it("flattens a newline inside a cell", () => {
    // A pipe table is line-based, so a cell that spans lines would break the
    // row it sits in. The assertion is on the cell, not on the table — the
    // table's own rows are separated by newlines followed by a pipe.
    const out = toMarkdown([["two\nlines"]]);
    expect(out.split("\n")[0]).toBe("| two lines |");
    expect(out.split("\n")).toHaveLength(2);
  });

  it("handles an empty table", () => {
    expect(toMarkdown([])).toBe("");
  });
});

describe("columnStats", () => {
  const rows = parse("name,age,note\nAda,36,\nBo,,x\nCy,41,");

  it("counts filled, empty and unique values per column", () => {
    const s = columnStats(rows, true);
    expect(s.map((c) => c.name)).toEqual(["name", "age", "note"]);
    expect(s[0]).toMatchObject({ filled: 3, empty: 0, unique: 3 });
    expect(s[1]).toMatchObject({ filled: 2, empty: 1 });
    expect(s[2]).toMatchObject({ filled: 1, empty: 2 });
  });

  it("flags a column that is entirely numeric", () => {
    const s = columnStats(rows, true);
    expect(s[0].numeric).toBe(false);
    expect(s[1].numeric).toBe(true);
  });

  it("does not call an empty column numeric", () => {
    expect(columnStats(parse("a\n\n"), true)[0].numeric).toBe(false);
  });

  it("numbers the columns when there is no header", () => {
    expect(columnStats(parse("1,2"), false).map((c) => c.name)).toEqual(["1", "2"]);
  });

  it("handles an empty table", () => {
    expect(columnStats([])).toEqual([]);
  });
});
