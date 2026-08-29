import { describe, expect, it } from "vitest";
import { calcIit } from "./iit";

describe("calcIit", () => {
  it("returns zero tax below the threshold", () => {
    const r = calcIit({ monthlyIncome: 5000, socialMonthly: 0, additionalMonthly: 0 });
    expect(r.taxable).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.bracket).toBe(0);
  });

  it("applies the 10% bracket with its quick deduction", () => {
    // 10 000 × 12 − 60 000 = 60 000 taxable → 60 000 × 10% − 2 520.
    const r = calcIit({ monthlyIncome: 10000, socialMonthly: 0, additionalMonthly: 0 });
    expect(r.taxable).toBe(60000);
    expect(r.tax).toBeCloseTo(3480, 6);
    expect(r.bracket).toBe(2);
  });

  it("subtracts social contributions and special deductions", () => {
    // 30 000 × 12 − 60 000 − 3 000 × 12 − 4 000 × 12 = 216 000 → 20% bracket.
    const r = calcIit({ monthlyIncome: 30000, socialMonthly: 3000, additionalMonthly: 4000 });
    expect(r.taxable).toBe(216000);
    expect(r.tax).toBeCloseTo(216000 * 0.2 - 16920, 6);
    expect(r.bracket).toBe(3);
    expect(r.afterTax).toBeCloseTo(360000 - 36000 - r.tax, 6);
  });

  it("reaches the top bracket on high income", () => {
    const r = calcIit({ monthlyIncome: 100000, socialMonthly: 0, additionalMonthly: 0 });
    expect(r.taxable).toBe(1140000);
    expect(r.tax).toBeCloseTo(1140000 * 0.45 - 181920, 6);
    expect(r.bracket).toBe(7);
    expect(r.effectiveRate).toBeCloseTo(r.tax / r.annualIncome, 9);
  });

  it("never reports negative taxable income or tax", () => {
    const r = calcIit({ monthlyIncome: 4000, socialMonthly: 1000, additionalMonthly: 2000 });
    expect(r.taxable).toBe(0);
    expect(r.tax).toBe(0);
  });
});
