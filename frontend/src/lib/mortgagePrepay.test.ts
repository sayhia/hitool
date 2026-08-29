import { describe, expect, it } from "vitest";
import { prepayPlan } from "./mortgagePrepay";

describe("prepayPlan", () => {
  const base = {
    principal: 1_200_000,
    annualRate: 3.6,
    months: 360,
    method: "equal" as const,
    prepayAt: 24,
    prepayAmount: 200_000,
    mode: "shorten" as const,
  };

  it("rejects impossible inputs", () => {
    expect(prepayPlan({ ...base, principal: 0 })).toBeNull();
    expect(prepayPlan({ ...base, prepayAmount: 0 })).toBeNull();
    expect(prepayPlan({ ...base, prepayAt: 0 })).toBeNull();
    expect(prepayPlan({ ...base, prepayAt: 360 })).toBeNull();
    expect(prepayPlan({ ...base, months: 1 })).toBeNull();
  });

  it("handles a zero-rate loan exactly (reduce mode)", () => {
    // 120 000 over 12 months at 0%: 10 000/month; after 6 months the balance
    // is 60 000, a 30 000 lump sum leaves 30 000 spread over 6 months.
    const r = prepayPlan({
      principal: 120_000,
      annualRate: 0,
      months: 12,
      method: "equal",
      prepayAt: 6,
      prepayAmount: 30_000,
      mode: "reduce",
    });
    expect(r!.newMonthly).toBeCloseTo(5_000, 6);
    expect(r!.newMonths).toBe(12);
    expect(r!.savedInterest).toBeCloseTo(0, 6);
  });

  it("shortens the term at a zero rate without losing interest", () => {
    const r = prepayPlan({
      principal: 120_000,
      annualRate: 0,
      months: 12,
      method: "equal",
      prepayAt: 6,
      prepayAmount: 30_000,
      mode: "shorten",
    });
    expect(r!.newMonths).toBe(9); // 30 000 left at 10 000/month
    expect(r!.savedMonths).toBe(3);
    expect(r!.newMonthly).toBeCloseTo(10_000, 6);
  });

  it("shortening saves more interest than reducing", () => {
    const shorten = prepayPlan({ ...base, mode: "shorten" });
    const reduce = prepayPlan({ ...base, mode: "reduce" });
    expect(shorten!.savedInterest).toBeGreaterThan(0);
    expect(reduce!.savedInterest).toBeGreaterThan(0);
    expect(shorten!.savedInterest).toBeGreaterThan(reduce!.savedInterest);
    expect(shorten!.savedMonths).toBeGreaterThan(0);
    expect(reduce!.savedMonths).toBe(0);
    expect(reduce!.newMonthly).toBeLessThan(reduce!.monthly);
  });

  it("keeps the instalment unchanged in shorten mode", () => {
    const r = prepayPlan({ ...base, mode: "shorten" });
    expect(r!.newMonthly).toBeCloseTo(r!.monthly, 6);
  });

  it("supports the equal-principal method", () => {
    const r = prepayPlan({
      principal: 1_200_000,
      annualRate: 3.6,
      months: 240,
      method: "principal",
      prepayAt: 24,
      prepayAmount: 200_000,
      mode: "shorten",
    });
    expect(r!.savedMonths).toBeGreaterThan(0);
    expect(r!.savedInterest).toBeGreaterThan(0);
    expect(r!.monthly).toBeCloseTo(5_000 + 1_200_000 * 0.003, 6);
  });

  it("clears the loan outright when the lump sum covers the balance", () => {
    const r = prepayPlan({
      principal: 100_000,
      annualRate: 3.6,
      months: 120,
      method: "equal",
      prepayAt: 12,
      prepayAmount: 1_000_000,
      mode: "shorten",
    });
    expect(r!.newMonths).toBe(12);
    expect(r!.newMonthly).toBe(0);
    expect(r!.savedInterest).toBeGreaterThan(0);
  });
});
