import { describe, expect, it } from "vitest";
import { daysBetween, daysUntil, nextOccurrence, parseDate } from "./countdown";

describe("countdown", () => {
  const today = new Date(2026, 7, 21); // Aug 21, 2026

  it("counts whole calendar days, ignoring times", () => {
    expect(daysBetween(today, new Date(2026, 7, 24))).toBe(3);
    expect(daysBetween(new Date(2026, 7, 21, 23, 59), new Date(2026, 7, 22, 0, 1))).toBe(1);
    expect(daysBetween(today, new Date(2026, 7, 18))).toBe(-3);
    expect(daysBetween(today, today)).toBe(0);
  });

  it("parses strict YYYY-MM-DD dates", () => {
    expect(parseDate("2026-08-21")!.getTime()).toBe(today.getTime());
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("2026-13-01")).toBeNull();
    expect(parseDate("2026/08/21")).toBeNull();
  });

  it("counts down one-off events, negative once past", () => {
    expect(daysUntil({ id: "1", name: "x", date: "2026-08-24", yearly: false }, today)).toBe(3);
    expect(daysUntil({ id: "2", name: "x", date: "2026-08-18", yearly: false }, today)).toBe(-3);
  });

  it("rolls yearly events forward to the next occurrence", () => {
    // Jun 15 has passed in 2026 → next is 2027-06-15.
    const n = daysUntil({ id: "3", name: "x", date: "2020-06-15", yearly: true }, today);
    expect(n).toBe(daysBetween(today, new Date(2027, 5, 15)));
    expect(n).toBeGreaterThan(0);
  });

  it("reports zero on the day itself", () => {
    expect(daysUntil({ id: "4", name: "x", date: "2026-08-21", yearly: true }, today)).toBe(0);
    expect(daysUntil({ id: "5", name: "x", date: "2026-08-21", yearly: false }, today)).toBe(0);
  });

  it("lands Feb 29 anniversaries on Feb 28 in common years", () => {
    const d = nextOccurrence(2, 29, new Date(2026, 2, 1)); // Mar 1, 2026
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(28);
  });

  it("keeps Feb 29 on its real day in leap years", () => {
    const d = nextOccurrence(2, 29, new Date(2027, 5, 1)); // Jun 1, 2027
    expect(d.getFullYear()).toBe(2028);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(29);
  });
});
