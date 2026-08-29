import { describe, expect, it } from "vitest";
import { SNIPPETS, detectUnit, formats, parseLoose, relative, toDate } from "./datetime";

describe("detectUnit", () => {
  it("reads 10-digit values as seconds and 13-digit as milliseconds", () => {
    expect(detectUnit(1767225600)).toBe("s");
    expect(detectUnit(1767225600000)).toBe("ms");
  });

  it("puts the boundary at 1e11 so 2286 still reads as seconds", () => {
    expect(detectUnit(99_999_999_999)).toBe("s");
    expect(detectUnit(100_000_000_000)).toBe("ms");
  });

  it("treats the epoch and negatives by magnitude", () => {
    expect(detectUnit(0)).toBe("s");
    expect(detectUnit(-1767225600)).toBe("s");
    expect(detectUnit(-1767225600000)).toBe("ms");
  });
});

describe("toDate", () => {
  it("honours an explicit unit over the guess", () => {
    // 1000 as ms is 1970-01-01T00:00:01Z; as s it is 00:16:40Z.
    expect(toDate(1000, "ms").getTime()).toBe(1000);
    expect(toDate(1000, "s").getTime()).toBe(1_000_000);
  });

  it("guesses when asked to", () => {
    expect(toDate(1767225600, "auto").getTime()).toBe(1767225600000);
    expect(toDate(1767225600000, "auto").getTime()).toBe(1767225600000);
  });
});

describe("formats", () => {
  const d = new Date(Date.UTC(2026, 7, 2, 4, 5, 6, 700));

  it("produces every documented representation", () => {
    const keys = formats(d).map((f) => f.key);
    expect(keys).toEqual([
      "iso",
      "rfc",
      "local",
      "utc",
      "cn",
      "slash",
      "ms",
      "s",
      "isoLocal",
    ]);
  });

  const byKey = (k: string) => formats(d).find((f) => f.key === k)!.value;

  it("renders ISO and the two timestamps from the same instant", () => {
    expect(byKey("iso")).toBe("2026-08-02T04:05:06.700Z");
    expect(byKey("ms")).toBe(String(d.getTime()));
    expect(byKey("s")).toBe(String(Math.floor(d.getTime() / 1000)));
  });

  it("zero-pads local and slash forms", () => {
    expect(byKey("local")).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(byKey("slash")).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("marks the UTC row as UTC so it can't be mistaken for local", () => {
    expect(byKey("utc")).toContain("UTC");
    expect(byKey("utc")).toContain("2026-08-02 04:05:06");
  });

  it("includes a weekday in the Chinese form", () => {
    expect(byKey("cn")).toMatch(/周[日一二三四五六]/);
  });

  it("never emits an empty value", () => {
    for (const f of formats(d)) expect(f.value, f.key).not.toBe("");
  });
});

describe("relative", () => {
  const now = new Date(2026, 7, 2, 12, 0, 0);
  const at = (ms: number) => new Date(now.getTime() + ms);

  it("collapses to the largest fitting unit", () => {
    expect(relative(at(-5000), now, "zh")).toBe("5 秒前");
    expect(relative(at(-90 * 1000), now, "zh")).toBe("2 分钟前");
    expect(relative(at(-3 * 3600 * 1000), now, "zh")).toBe("3 小时前");
    expect(relative(at(-2 * 86400 * 1000), now, "zh")).toBe("2 天前");
  });

  it("distinguishes past from future", () => {
    expect(relative(at(-3600 * 1000), now, "zh")).toContain("前");
    expect(relative(at(3600 * 1000), now, "zh")).toContain("后");
    expect(relative(at(-3600 * 1000), now, "en")).toContain("ago");
    expect(relative(at(3600 * 1000), now, "en")).toContain("in ");
  });

  it("pluralises English but not Chinese", () => {
    expect(relative(at(-1000), now, "en")).toBe("1 second ago");
    expect(relative(at(-2000), now, "en")).toBe("2 seconds ago");
  });

  it("never reports zero of anything", () => {
    expect(relative(at(-1), now, "zh")).toBe("1 秒前");
    expect(relative(now, now, "zh")).toBe("1 秒后");
  });
});

describe("parseLoose", () => {
  it("accepts ISO, SQL and slash forms", () => {
    expect(parseLoose("2026-08-02T12:00:00Z")?.getTime()).toBe(Date.UTC(2026, 7, 2, 12));
    expect(parseLoose("2026-08-02 12:00:00")).toBeInstanceOf(Date);
    expect(parseLoose("2026/08/02 12:00:00")).toBeInstanceOf(Date);
  });

  it("reads the space form as local time, matching what the user typed", () => {
    const d = parseLoose("2026-08-02 12:00:00")!;
    expect(d.getHours()).toBe(12);
  });

  it("returns null for junk and empty input", () => {
    expect(parseLoose("")).toBeNull();
    expect(parseLoose("   ")).toBeNull();
    expect(parseLoose("not a date")).toBeNull();
  });
});

describe("SNIPPETS", () => {
  it("ships a non-empty snippet for every listed language", () => {
    expect(SNIPPETS.length).toBeGreaterThan(5);
    for (const s of SNIPPETS) {
      expect(s.label, JSON.stringify(s)).toBeTruthy();
      expect(s.code, s.label).toBeTruthy();
    }
  });
});
