import { describe, expect, it } from "vitest";
import {
  MAX_FIELD,
  normalizeRecords,
  pushRecord,
  removeRecord,
  snippet,
  type AiRecord,
} from "./aiHistory";

function rec(id: string, ts: number, over: Partial<AiRecord> = {}): AiRecord {
  return { id, toolId: "ai-polish", input: "in", output: "out", ts, ...over };
}

describe("snippet", () => {
  it("collapses whitespace and trims", () => {
    expect(snippet("  a\n\n  b\tc ")).toBe("a b c");
    expect(snippet("x".repeat(100), 10)).toBe("xxxxxxxxxx…");
  });

  it("leaves short text untouched", () => {
    expect(snippet("hello")).toBe("hello");
    expect(snippet("")).toBe("");
  });
});

describe("pushRecord", () => {
  it("prepends newest first", () => {
    const list = pushRecord([], rec("a", 1));
    const two = pushRecord(list, rec("b", 2));
    expect(two.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("trims to the cap", () => {
    let list: AiRecord[] = [];
    for (let i = 0; i < 5; i++) list = pushRecord(list, rec(`r${i}`, i), 3);
    expect(list.map((r) => r.id)).toEqual(["r4", "r3", "r2"]);
  });

  it("clamps oversized input and output", () => {
    const [r] = pushRecord(
      [],
      rec("big", 1, { input: "i".repeat(MAX_FIELD + 99), output: "o".repeat(MAX_FIELD + 99) }),
    );
    expect(r.input).toHaveLength(MAX_FIELD);
    expect(r.output).toHaveLength(MAX_FIELD);
  });
});

describe("removeRecord", () => {
  it("drops only the matching id", () => {
    const list = [rec("a", 1), rec("b", 2)];
    expect(removeRecord(list, "a").map((r) => r.id)).toEqual(["b"]);
    expect(removeRecord(list, "zz")).toHaveLength(2);
  });
});

describe("normalizeRecords", () => {
  it("rejects non-arrays and bad rows", () => {
    expect(normalizeRecords(null)).toEqual([]);
    expect(normalizeRecords("nope")).toEqual([]);
    expect(normalizeRecords([null, { id: "x" }, { id: "y", toolId: "t" }])).toHaveLength(1);
  });

  it("sorts newest first and caps", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, toolId: "t", ts: i }));
    const out = normalizeRecords(rows);
    expect(out).toHaveLength(50);
    expect(out[0].id).toBe("r59");
  });
});
