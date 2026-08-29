import { describe, expect, it } from "vitest";
import { nightHour, scheduledTheme } from "./theme";

function at(hour: number): Date {
  return new Date(2026, 5, 15, hour, 30);
}

describe("scheduledTheme", () => {
  it("is light between 07:00 and the night hour", () => {
    nightHour.value = 19;
    expect(scheduledTheme(at(7))).toBe("light");
    expect(scheduledTheme(at(12))).toBe("light");
    expect(scheduledTheme(at(18))).toBe("light");
  });

  it("is dark before 07:00 and from the night hour onward", () => {
    nightHour.value = 19;
    expect(scheduledTheme(at(0))).toBe("dark");
    expect(scheduledTheme(at(6))).toBe("dark");
    expect(scheduledTheme(at(19))).toBe("dark");
    expect(scheduledTheme(at(23))).toBe("dark");
  });

  it("respects a later night hour", () => {
    nightHour.value = 22;
    expect(scheduledTheme(at(21))).toBe("light");
    expect(scheduledTheme(at(22))).toBe("dark");
    nightHour.value = 19; // restore for other tests
  });
});
