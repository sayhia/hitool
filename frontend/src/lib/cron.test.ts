import { describe, expect, it } from "vitest";
import {
  FIELDS,
  ORDER,
  PRESETS,
  buildExpression,
  daysConflict,
  defaultConfig,
  expand,
  fieldToText,
  formatRun,
  nextRuns,
  parseExpression,
  parseField,
  type FieldSpec,
} from "./cron";

/** Fixed clock so "next run" assertions don't drift with the wall clock. */
const NOW = new Date(2026, 7, 2, 12, 0, 0); // Sun 2026-08-02 12:00:00 local

describe("parseField", () => {
  it("reads every / unset / range / step / list", () => {
    expect(parseField("minute", "*")?.mode).toBe("every");
    expect(parseField("day", "?")?.mode).toBe("unset");
    expect(parseField("hour", "9-18")).toMatchObject({ mode: "range", rangeFrom: 9, rangeTo: 18 });
    expect(parseField("minute", "0/15")).toMatchObject({ mode: "step", stepFrom: 0, stepEvery: 15 });
    expect(parseField("hour", "9,12,18")).toMatchObject({ mode: "list", list: [9, 12, 18] });
  });

  it("treats */n as a step from the field minimum", () => {
    expect(parseField("minute", "*/5")).toMatchObject({ mode: "step", stepFrom: 0, stepEvery: 5 });
  });

  it("clamps out-of-range values instead of accepting them", () => {
    expect(parseField("hour", "0-99")?.rangeTo).toBe(23);
    // 99 is dropped entirely, leaving only the legal member
    expect(parseField("month", "3,99")?.list).toEqual([3]);
  });

  it("rejects junk", () => {
    expect(parseField("minute", "abc")).toBeNull();
    expect(parseField("minute", "")).toBeNull();
    expect(parseField("minute", "1-")).toBeNull();
  });

  it("downgrades ? to * on fields that cannot be unset", () => {
    // Only day-of-month and day-of-week may be "?" in Quartz.
    expect(parseField("minute", "?")?.mode).toBe("every");
  });
});

describe("expression round-trip", () => {
  const cases = [
    "0 * * * * ?",
    "0 0 * * * ?",
    "0 0 0 * * ?",
    "0 0 9 ? * 2-6",
    "0 0 0 1 * ?",
    "30 0/5 * * * ?",
    "0 15 10 ? * *",
    "0 0 9,18 * * ?",
    "0 0 0 1 1,4,7,10 ?",
  ];

  for (const expr of cases) {
    it(`survives ${expr}`, () => {
      const cfg = parseExpression(expr);
      expect(cfg).not.toBeNull();
      expect(buildExpression(cfg!)).toBe(expr);
    });
  }

  it("accepts a 5-field expression by assuming second 0", () => {
    const cfg = parseExpression("0 9 * * 2");
    expect(cfg).not.toBeNull();
    expect(fieldToText("second", cfg!.second)).toBe("0");
  });

  it("rejects the wrong number of fields", () => {
    expect(parseExpression("0 0")).toBeNull();
    expect(parseExpression("0 0 0 0 0 0 0")).toBeNull();
  });

  it("parses every shipped preset", () => {
    for (const p of PRESETS) {
      expect(parseExpression(p.expr), p.expr).not.toBeNull();
    }
  });
});

describe("expand", () => {
  it("enumerates a step from its start, not from zero", () => {
    const spec: FieldSpec = {
      mode: "step",
      rangeFrom: 0,
      rangeTo: 59,
      stepFrom: 10,
      stepEvery: 20,
      list: [],
    };
    expect(expand("minute", spec)).toEqual([10, 30, 50]);
  });

  it("normalises a reversed range", () => {
    const spec: FieldSpec = {
      mode: "range",
      rangeFrom: 18,
      rangeTo: 9,
      stepFrom: 0,
      stepEvery: 1,
      list: [],
    };
    expect(expand("hour", spec)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it("covers the whole domain for every/unset", () => {
    const cfg = defaultConfig();
    expect(expand("month", cfg.month)).toHaveLength(12);
    // Weekday is "unset" by default but still enumerates 1-7 for matching.
    expect(expand("week", cfg.week)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("nextRuns", () => {
  it("fires every minute on the minute", () => {
    const runs = nextRuns(parseExpression("0 * * * * ?")!, 3, NOW);
    expect(runs.map(formatRun)).toEqual([
      "2026-08-02 12:01:00",
      "2026-08-02 12:02:00",
      "2026-08-02 12:03:00",
    ]);
  });

  it("maps Quartz weekdays correctly (2-6 = Mon-Fri)", () => {
    const runs = nextRuns(parseExpression("0 0 9 ? * 2-6")!, 5, NOW);
    expect(runs.map(formatRun)).toEqual([
      "2026-08-03 09:00:00",
      "2026-08-04 09:00:00",
      "2026-08-05 09:00:00",
      "2026-08-06 09:00:00",
      "2026-08-07 09:00:00",
    ]);
    // Mon..Fri => JS getDay 1..5
    expect(runs.map((d) => d.getDay())).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles a sparse monthly schedule without scanning second by second", () => {
    const runs = nextRuns(parseExpression("0 0 0 1 * ?")!, 3, NOW);
    expect(runs.map(formatRun)).toEqual([
      "2026-09-01 00:00:00",
      "2026-10-01 00:00:00",
      "2026-11-01 00:00:00",
    ]);
  });

  it("respects a seconds field", () => {
    const runs = nextRuns(parseExpression("30 0/5 * * * ?")!, 2, new Date(2026, 7, 2, 12, 3, 0));
    expect(runs.map(formatRun)).toEqual(["2026-08-02 12:05:30", "2026-08-02 12:10:30"]);
  });

  it("returns nothing for a schedule that can never fire", () => {
    const cfg = parseExpression("0 0 0 ? * 1")!;
    // Ask for a weekday that is excluded by an impossible month set.
    cfg.month = { mode: "list", rangeFrom: 1, rangeTo: 12, stepFrom: 1, stepEvery: 1, list: [] };
    expect(nextRuns(cfg, 3, NOW)).toEqual([]);
  });

  it("never returns a time in the past", () => {
    for (const p of PRESETS) {
      const runs = nextRuns(parseExpression(p.expr)!, 3, NOW);
      for (const r of runs) expect(r.getTime(), p.expr).toBeGreaterThan(NOW.getTime());
    }
  });
});

describe("field metadata", () => {
  it("declares one entry per ordered field", () => {
    expect(FIELDS.map((f) => f.id)).toEqual(ORDER);
  });

  it("only allows ? where Quartz does", () => {
    expect(FIELDS.filter((f) => f.canUnset).map((f) => f.id)).toEqual(["day", "week"]);
  });
});

/**
 * A second answer to the same question, computed a different way: step one
 * second at a time and keep every timestamp whose fields all match.
 *
 * It shares none of `nextRuns`' day-skipping, which is where a scheduler's
 * bugs live — a day advanced twice, a rollover that lands before `from`, an
 * hour that does not exist. Brute force is unusable in the app and ideal here.
 */
function scanRuns(expr: string, count: number, from: Date, windowDays = 3): Date[] {
  const cfg = parseExpression(expr)!;
  const sets = {
    second: new Set(expand("second", cfg.second)),
    minute: new Set(expand("minute", cfg.minute)),
    hour: new Set(expand("hour", cfg.hour)),
    month: new Set(expand("month", cfg.month)),
    day: new Set(expand("day", cfg.day)),
    week: new Set(expand("week", cfg.week)),
  };
  const domFree = cfg.day.mode === "unset";
  const dowFree = cfg.week.mode === "unset";

  const out: Date[] = [];
  const t = new Date(from.getTime() + 1000);
  t.setMilliseconds(0);
  const stop = from.getTime() + windowDays * 86_400_000;
  while (t.getTime() <= stop && out.length < count) {
    if (
      sets.second.has(t.getSeconds()) &&
      sets.minute.has(t.getMinutes()) &&
      sets.hour.has(t.getHours()) &&
      sets.month.has(t.getMonth() + 1) &&
      (domFree || sets.day.has(t.getDate())) &&
      (dowFree || sets.week.has(t.getDay() + 1))
    ) {
      out.push(new Date(t));
    }
    t.setSeconds(t.getSeconds() + 1);
  }
  return out;
}

const runsOf = (expr: string, count: number, from: Date) =>
  nextRuns(parseExpression(expr)!, count, from).map(formatRun);

describe("nextRuns — against a second-by-second scan", () => {
  // `from` is picked per case so the runs land inside the scan window.
  const CASES: [string, Date, number][] = [
    ["0 * * * * ?", new Date(2026, 7, 2, 12, 0, 0), 6],
    ["*/15 * * * * ?", new Date(2026, 7, 2, 12, 0, 7), 8],
    ["0 0 * * * ?", new Date(2026, 7, 2, 12, 30, 0), 5],
    ["0 30 9 * * ?", new Date(2026, 7, 2, 12, 0, 0), 3],
    ["0 0 9-17 * * ?", new Date(2026, 7, 2, 8, 0, 0), 12],
    ["0 0/30 8-9 * * ?", new Date(2026, 7, 2, 7, 0, 0), 5],
    ["0 0 0 ? * 2-6", new Date(2026, 7, 2, 23, 0, 0), 2],
    ["15,45 * * * * ?", new Date(2026, 7, 2, 12, 0, 0), 6],
    ["0 0 12 ? * 1", new Date(2026, 7, 1, 12, 0, 1), 2],
    ["30 5 0 * * ?", new Date(2026, 7, 2, 23, 59, 59), 2],
    ["0 0 0 3 * ?", new Date(2026, 7, 2, 23, 59, 0), 1],
    ["59 59 23 * * ?", new Date(2026, 7, 2, 0, 0, 0), 2],
    // Crossing a month boundary, and a day-of-month that August has.
    ["0 0 0 1,15,31 * ?", new Date(2026, 7, 30, 0, 0, 0), 2],
  ];

  for (const [expr, from, count] of CASES) {
    it(`${expr} from ${formatRun(from)}`, () => {
      const scanned = scanRuns(expr, count, from, 9).map(formatRun);
      expect(scanned.length, "scan window too small for this case").toBe(count);
      expect(runsOf(expr, count, from)).toEqual(scanned);
    });
  }
});

describe("nextRuns — properties that hold for any schedule", () => {
  const EXPRS = [
    "0 * * * * ?",
    "*/7 */11 * * * ?",
    "0 0 0 29 2 ?",
    "0 0 0 31 * ?",
    "0 0 0 ? * 7",
    "0 15 10 ? * 2,4,6",
    "0 0 0 1 1 ?",
    "0 0 0 ? 12 2",
  ];
  const FROMS = [
    new Date(2026, 0, 1, 0, 0, 0),
    new Date(2026, 1, 28, 23, 59, 59),
    new Date(2026, 7, 2, 12, 0, 0),
    new Date(2027, 11, 31, 23, 59, 59),
  ];

  it("returns runs that are strictly increasing and all in the future", () => {
    for (const expr of EXPRS) {
      for (const from of FROMS) {
        const runs = nextRuns(parseExpression(expr)!, 5, from);
        for (let i = 0; i < runs.length; i++) {
          expect(runs[i].getTime(), `${expr} @ ${formatRun(from)}`).toBeGreaterThan(from.getTime());
          if (i) expect(runs[i].getTime()).toBeGreaterThan(runs[i - 1].getTime());
        }
      }
    }
  });

  it("returns runs that each match every field of the expression", () => {
    for (const expr of EXPRS) {
      for (const from of FROMS) {
        const cfg = parseExpression(expr)!;
        const has = (id: Parameters<typeof expand>[0], v: number) =>
          expand(id, cfg[id]).includes(v);
        for (const r of nextRuns(cfg, 5, from)) {
          const where = `${expr} → ${formatRun(r)}`;
          expect(has("second", r.getSeconds()), where).toBe(true);
          expect(has("minute", r.getMinutes()), where).toBe(true);
          expect(has("hour", r.getHours()), where).toBe(true);
          expect(has("month", r.getMonth() + 1), where).toBe(true);
          if (cfg.day.mode !== "unset") expect(has("day", r.getDate()), where).toBe(true);
          if (cfg.week.mode !== "unset") expect(has("week", r.getDay() + 1), where).toBe(true);
        }
      }
    }
  });

  it("skips a day-of-month the month does not have", () => {
    // 31 exists in 7 months; February never fires at all.
    const runs = nextRuns(parseExpression("0 0 0 31 * ?")!, 12, new Date(2026, 0, 1));
    expect(runs.every((r) => r.getDate() === 31)).toBe(true);
    expect(runs.some((r) => r.getMonth() === 1)).toBe(false);
  });

  it("finds Feb 29 across the leap gap", () => {
    const runs = nextRuns(parseExpression("0 0 0 29 2 ?")!, 1, new Date(2026, 2, 1));
    expect(runs).toHaveLength(1);
    expect(formatRun(runs[0])).toBe("2028-02-29 00:00:00");
  });
});

/**
 * Daylight saving. `new Date(y, m, d, h, ...)` for a local time the clock
 * skipped returns the next instant that does exist, so a schedule could
 * preview a time its own expression forbids.
 *
 * The gap is looked up in whatever zone the suite is running in rather than
 * hard-coded, so this is a real test wherever there is one and skips itself
 * where there is not. `TZ=America/New_York npm test` is the quick way to see
 * it bite; on a machine set to Asia/Shanghai it has nothing to do.
 */
function findSpringForwardGap(): { year: number; month: number; date: number; hour: number } | null {
  const d = new Date(2026, 0, 1);
  for (let i = 0; i < 730; i++) {
    for (let h = 0; h < 6; h++) {
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 30, 0);
      if (t.getHours() !== h) {
        return { year: d.getFullYear(), month: d.getMonth(), date: d.getDate(), hour: h };
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return null;
}

const GAP = findSpringForwardGap();

describe.skipIf(!GAP)("nextRuns — across a daylight saving jump", () => {
  it("never previews a time the expression does not allow", () => {
    const g = GAP!;
    const cfg = parseExpression(`0 30 ${g.hour} * * ?`)!;
    const from = new Date(g.year, g.month, g.date - 1, 12, 0, 0);
    const runs = nextRuns(cfg, 4, from);
    expect(runs.length).toBe(4);
    for (const r of runs) {
      expect(r.getHours(), `${formatRun(r)} is outside the hour field`).toBe(g.hour);
    }
  });

  it("simply has no run on the day the hour is missing", () => {
    const g = GAP!;
    const from = new Date(g.year, g.month, g.date - 1, 12, 0, 0);
    const runs = nextRuns(parseExpression(`0 30 ${g.hour} * * ?`)!, 4, from);
    const onGapDay = runs.filter((r) => r.getDate() === g.date && r.getMonth() === g.month);
    expect(onGapDay).toEqual([]);
  });

  it("still fires on the days either side of it", () => {
    const g = GAP!;
    const from = new Date(g.year, g.month, g.date - 1, 0, 0, 0);
    const runs = nextRuns(parseExpression(`0 30 ${g.hour} * * ?`)!, 3, from);
    const days = runs.map((r) => r.getDate());
    expect(days).toContain(g.date - 1);
    expect(days).toContain(g.date + 1);
  });
});

describe("daysConflict", () => {
  const cfg = (expr: string) => parseExpression(expr)!;

  it("is false when one of the day fields is ?", () => {
    expect(daysConflict(cfg("0 0 0 15 * ?"))).toBe(false);
    expect(daysConflict(cfg("0 0 0 ? * 2"))).toBe(false);
  });

  it("is true when neither is", () => {
    expect(daysConflict(cfg("0 0 0 15 * 2"))).toBe(true);
    expect(daysConflict(cfg("0 0 0 1-7 * 2"))).toBe(true);
  });

  it("marks the case where the three dialects disagree", () => {
    // Intersection here: the 15th, but only when it is a Monday. Unix cron
    // would take the union and fire far more often; Quartz would refuse the
    // expression. The UI warns because the same six tokens read three ways.
    const runs = nextRuns(cfg("0 0 0 15 * 2"), 2, new Date(2026, 7, 2)).map(formatRun);
    expect(runs).toEqual(["2027-02-15 00:00:00", "2027-03-15 00:00:00"]);
    for (const r of nextRuns(cfg("0 0 0 15 * 2"), 4, new Date(2026, 7, 2))) {
      expect(r.getDate()).toBe(15);
      expect(r.getDay()).toBe(1); // Monday
    }
  });
});
