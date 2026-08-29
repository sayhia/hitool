/**
 * Mortgage prepayment planning: what a one-off lump-sum payment saves, under
 * either repayment method and either bank policy — shortening the term or
 * shrinking the monthly instalment.
 *
 * Everything is simulated month by month against the remaining balance, which
 * keeps the two methods honest and makes rounding behave the way a bank
 * statement does.
 */

export type RepayMethod = "equal" | "principal"; // 等额本息 | 等额本金
export type PrepayMode = "shorten" | "reduce"; // 缩短期限 | 减少月供

export interface PrepayInput {
  /** Loan amount. */
  principal: number;
  /** Annual rate in percent, e.g. 3.6. */
  annualRate: number;
  /** Total term in months. */
  months: number;
  method: RepayMethod;
  /** The lump sum lands after this many instalments have been paid (1-based). */
  prepayAt: number;
  prepayAmount: number;
  mode: PrepayMode;
}

export interface PrepayResult {
  /** Original instalment — the fixed one for "equal", the first for "principal". */
  monthly: number;
  /** Interest paid over the untouched loan. */
  totalInterest: number;
  /** Interest actually paid under the prepayment plan. */
  newTotalInterest: number;
  savedInterest: number;
  /** Total months until the loan is cleared under the plan. */
  newMonths: number;
  savedMonths: number;
  /** Instalment after the prepayment; unchanged in "shorten" mode. */
  newMonthly: number;
}

/** Fixed instalment for an equal-payment loan; 0-rate loans split evenly. */
function equalInstalment(principal: number, r: number, months: number): number {
  if (months <= 0 || principal <= 0) return 0;
  if (r === 0) return principal / months;
  const k = Math.pow(1 + r, months);
  return (principal * r * k) / (k - 1);
}

/**
 * Run the schedule off a balance for `months` instalments and return the
 * interest accrued plus the balance left over. For "principal" the per-month
 * principal part is passed in explicitly, since it is fixed for the life of
 * that schedule.
 */
function runSchedule(
  balance: number,
  r: number,
  months: number,
  method: RepayMethod,
  instalment: number,
  principalPart: number,
): { interest: number; remaining: number } {
  let interest = 0;
  for (let i = 0; i < months && balance > 0; i++) {
    const due = balance * r;
    interest += due;
    const principal = method === "equal" ? instalment - due : principalPart;
    balance -= Math.min(principal, balance);
  }
  return { interest, remaining: Math.max(0, balance) };
}

/** Months needed to clear a balance at the given fixed instalment. */
function monthsToClear(balance: number, r: number, instalment: number): number {
  if (balance <= 0) return 0;
  if (r === 0) return Math.ceil(balance / instalment);
  // balance shrinks by (instalment − balance·r) each month; solve the
  // geometric decay instead of stepping it out.
  if (instalment <= balance * r) return Number.POSITIVE_INFINITY;
  return Math.ceil(Math.log(instalment / (instalment - balance * r)) / Math.log(1 + r));
}

export function prepayPlan(inp: PrepayInput): PrepayResult | null {
  const { principal, months, method, mode } = inp;
  const r = inp.annualRate / 100 / 12;
  if (principal <= 0 || months <= 1 || inp.prepayAmount <= 0) return null;
  // The lump sum lands between instalments; it must land before the last one.
  if (inp.prepayAt < 1 || inp.prepayAt >= months) return null;

  const instalment = equalInstalment(principal, r, months);
  const principalPart = principal / months; // 等额本金 monthly principal part

  // --- untouched baseline ---
  const base = runSchedule(
    principal,
    r,
    months,
    method,
    instalment,
    principalPart,
  );

  // --- pay the first `prepayAt` instalments, then drop in the lump sum ---
  const head = runSchedule(principal, r, inp.prepayAt, method, instalment, principalPart);
  const after = Math.max(0, head.remaining - inp.prepayAmount);
  if (after === 0) {
    // The lump sum clears the loan outright.
    return {
      monthly: method === "equal" ? instalment : principalPart + principal * r,
      totalInterest: base.interest,
      newTotalInterest: head.interest,
      savedInterest: base.interest - head.interest,
      newMonths: inp.prepayAt,
      savedMonths: months - inp.prepayAt,
      newMonthly: 0,
    };
  }

  const rem = months - inp.prepayAt; // remaining months without the prepayment
  let tailInterest: number;
  let newMonths: number;
  let newMonthly: number;

  if (mode === "shorten") {
    if (method === "equal") {
      newMonths = inp.prepayAt + monthsToClear(after, r, instalment);
      const tail = runSchedule(after, r, newMonths - inp.prepayAt, "equal", instalment, 0);
      tailInterest = tail.interest;
      newMonthly = instalment;
    } else {
      // Keep the principal part; the tail simply runs out sooner.
      const tailMonths = Math.ceil(after / principalPart);
      const tail = runSchedule(after, r, tailMonths, "principal", 0, principalPart);
      tailInterest = tail.interest;
      newMonths = inp.prepayAt + tailMonths;
      newMonthly = principalPart + after * r; // first instalment of the tail
    }
  } else {
    newMonths = months;
    if (method === "equal") {
      newMonthly = equalInstalment(after, r, rem);
      const tail = runSchedule(after, r, rem, "equal", newMonthly, 0);
      tailInterest = tail.interest;
    } else {
      const part = after / rem;
      const tail = runSchedule(after, r, rem, "principal", 0, part);
      tailInterest = tail.interest;
      newMonthly = part + after * r; // first instalment of the tail
    }
  }

  const newTotalInterest = head.interest + tailInterest;
  return {
    monthly: method === "equal" ? instalment : principalPart + principal * r,
    totalInterest: base.interest,
    newTotalInterest,
    savedInterest: base.interest - newTotalInterest,
    newMonths,
    savedMonths: months - newMonths,
    newMonthly,
  };
}
