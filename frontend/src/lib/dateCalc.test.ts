import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  diffCalendar,
  diffDays,
  formatYmd,
  parseYmd,
  workdays,
} from "./dateCalc";

const ymd = (s: string) => parseYmd(s)!;

describe("parseYmd", () => {
  it("accepts a plain date", () => {
    expect(formatYmd(ymd("2024-03-05"))).toBe("2024-03-05");
  });

  it("rejects rollover dates instead of silently shifting", () => {
    expect(parseYmd("2023-02-29")).toBeNull(); // not a leap year
    expect(parseYmd("2024-04-31")).toBeNull();
    expect(parseYmd("2024-13-01")).toBeNull();
  });

  it("accepts the leap day in a leap year", () => {
    expect(formatYmd(ymd("2024-02-29"))).toBe("2024-02-29");
  });
});

describe("diffDays", () => {
  it("counts across month and year boundaries", () => {
    expect(diffDays(ymd("2024-01-30"), ymd("2024-02-02"))).toBe(3);
    expect(diffDays(ymd("2023-12-31"), ymd("2024-01-01"))).toBe(1);
  });

  it("is signed and counts leap Februaries", () => {
    expect(diffDays(ymd("2024-03-01"), ymd("2024-02-01"))).toBe(-29);
    expect(diffDays(ymd("2023-03-01"), ymd("2023-02-01"))).toBe(-28);
  });
});

describe("workdays", () => {
  it("skips the weekend over a full week", () => {
    // Mon 2024-03-04 → Mon 2024-03-11: 7 days, 5 working days.
    expect(diffDays(ymd("2024-03-04"), ymd("2024-03-11"))).toBe(7);
    expect(workdays(ymd("2024-03-04"), ymd("2024-03-11"))).toBe(5);
  });

  it("matches the half-open interval of diffDays", () => {
    // Mon → Fri is 4 elapsed days, all weekdays.
    expect(workdays(ymd("2024-03-04"), ymd("2024-03-08"))).toBe(4);
    // A weekend-only span has no working days.
    expect(workdays(ymd("2024-03-09"), ymd("2024-03-11"))).toBe(0);
  });

  it("is negative when reversed", () => {
    expect(workdays(ymd("2024-03-11"), ymd("2024-03-04"))).toBe(-5);
  });
});

describe("addDays", () => {
  it("rolls over months and years", () => {
    expect(formatYmd(addDays(ymd("2024-01-30"), 3))).toBe("2024-02-02");
    expect(formatYmd(addDays(ymd("2023-12-31"), 1))).toBe("2024-01-01");
  });

  it("supports negative offsets", () => {
    expect(formatYmd(addDays(ymd("2024-03-01"), -1))).toBe("2024-02-29");
  });
});

describe("addMonths", () => {
  it("clamps to the end of shorter months", () => {
    expect(formatYmd(addMonths(ymd("2023-01-31"), 1))).toBe("2023-02-28");
    expect(formatYmd(addMonths(ymd("2024-01-31"), 1))).toBe("2024-02-29"); // leap
  });

  it("crosses year boundaries", () => {
    expect(formatYmd(addMonths(ymd("2024-11-30"), 3))).toBe("2025-02-28");
    expect(formatYmd(addMonths(ymd("2024-05-15"), -6))).toBe("2023-11-15");
  });

  it("keeps ordinary days untouched", () => {
    expect(formatYmd(addMonths(ymd("2024-03-15"), 2))).toBe("2024-05-15");
  });
});

describe("diffCalendar", () => {
  it("splits into whole months and leftover days", () => {
    expect(diffCalendar(ymd("2024-01-15"), ymd("2024-03-10"))).toEqual({ months: 1, days: 24 });
  });

  it("handles clamped month ends", () => {
    // Jan 31 → Mar 1: one month lands on Feb 29 (leap), leaving 1 day.
    expect(diffCalendar(ymd("2024-01-31"), ymd("2024-03-01"))).toEqual({ months: 1, days: 1 });
  });

  it("is signed when reversed", () => {
    expect(diffCalendar(ymd("2024-03-10"), ymd("2024-01-15"))).toEqual({ months: -1, days: -24 });
  });

  it("reports zero for the same date", () => {
    expect(diffCalendar(ymd("2024-06-01"), ymd("2024-06-01"))).toEqual({ months: 0, days: 0 });
  });
});
