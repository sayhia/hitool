/**
 * Chinese individual income tax on comprehensive income (个税), the 2019
 * annual cumulative scheme: yearly income minus the 60 000 threshold, social
 * contributions and special additional deductions, taxed by seven brackets.
 */

export interface IitInput {
  /** Pre-tax salary per month. */
  monthlyIncome: number;
  /** Social insurance + housing fund, the employee's share, per month. */
  socialMonthly: number;
  /** Special additional deductions (children, rent, elderly care…), per month. */
  additionalMonthly: number;
}

export interface IitResult {
  annualIncome: number;
  /** Income the tax is computed on, never below zero. */
  taxable: number;
  tax: number;
  /** tax / annualIncome, 0 when there is no income. */
  effectiveRate: number;
  afterTax: number;
  /** 1-based bracket the taxable income falls into (0 when tax-free). */
  bracket: number;
}

export interface IitBracket {
  /** Upper bound of the bracket; the last one is open-ended. */
  upTo: number;
  rate: number;
  quickDeduction: number;
}

/** 综合所得年度税率表（居民个人）. */
export const IIT_BRACKETS: IitBracket[] = [
  { upTo: 36000, rate: 0.03, quickDeduction: 0 },
  { upTo: 144000, rate: 0.1, quickDeduction: 2520 },
  { upTo: 300000, rate: 0.2, quickDeduction: 16920 },
  { upTo: 420000, rate: 0.25, quickDeduction: 31920 },
  { upTo: 660000, rate: 0.3, quickDeduction: 52920 },
  { upTo: 960000, rate: 0.35, quickDeduction: 85920 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.45, quickDeduction: 181920 },
];

/** Basic deduction per year (免征额 5 000 × 12). */
export const THRESHOLD = 60000;

export function calcIit(inp: IitInput): IitResult {
  const monthly = Math.max(0, inp.monthlyIncome);
  const annualIncome = monthly * 12;
  const taxable = Math.max(
    0,
    annualIncome - THRESHOLD - inp.socialMonthly * 12 - inp.additionalMonthly * 12,
  );

  let tax = 0;
  let bracket = 0;
  if (taxable > 0) {
    for (let i = 0; i < IIT_BRACKETS.length; i++) {
      if (taxable <= IIT_BRACKETS[i].upTo) {
        tax = taxable * IIT_BRACKETS[i].rate - IIT_BRACKETS[i].quickDeduction;
        bracket = i + 1;
        break;
      }
    }
  }
  tax = Math.max(0, tax);

  return {
    annualIncome,
    taxable,
    tax,
    effectiveRate: annualIncome > 0 ? tax / annualIncome : 0,
    afterTax: annualIncome - inp.socialMonthly * 12 - tax,
    bracket,
  };
}
