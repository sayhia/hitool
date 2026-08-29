/**
 * Password strength, the honest way: entropy from the character space that
 * is actually in use, discounted by the shortcuts attackers try first —
 * dictionary words, keyboard walks, repetitions. Not a guarantee, and the
 * UI says so.
 */

export interface StrengthResult {
  length: number;
  /** Bits of entropy after pattern discounts. */
  entropy: number;
  /** 0–4, zxcvbn-style. */
  score: 0 | 1 | 2 | 3 | 4;
  /** Seconds to exhaust the space at 10^10 guesses/s (offline attack). */
  crackSeconds: number;
  /** i18n hint keys, most important first. */
  hints: string[];
}

/** Passwords that top every breach corpus; being one of them is fatal. */
const COMMON = new Set([
  "password", "123456", "12345678", "123456789", "qwerty", "abc123",
  "password1", "111111", "1234567890", "letmein", "admin", "welcome",
  "monkey", "dragon", "iloveyou", "sunshine", "princess", "qwerty123",
]);

const GUESSES_PER_SECOND = 1e10;

function poolSize(pw: string): number {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9\s]/.test(pw)) pool += 33;
  if (/\s/.test(pw)) pool += 1;
  // Anything outside ASCII is its own (huge) space; count it conservatively.
  if (/[^\x00-\x7f]/.test(pw)) pool += 100;
  return pool;
}

/** Longest run of one repeated character, as a share of the password. */
function repetitionShare(pw: string): number {
  let best = 1;
  let run = 1;
  for (let i = 1; i < pw.length; i++) {
    run = pw[i] === pw[i - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return pw.length ? best / pw.length : 0;
}

/** Longest keyboard/sequence walk ("abcd", "4321", "qwerty" direction). */
function sequenceShare(pw: string): number {
  const lower = pw.toLowerCase();
  let best = 0;
  let run = 1;
  for (let i = 1; i < lower.length; i++) {
    const d = lower.charCodeAt(i) - lower.charCodeAt(i - 1);
    run = d === 1 || d === -1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return pw.length && best >= 4 ? best / pw.length : 0;
}

export function analysePassword(pw: string): StrengthResult {
  const length = [...pw].length;
  const hints: string[] = [];
  if (!pw) {
    return { length: 0, entropy: 0, score: 0, crackSeconds: 0, hints: ["empty"] };
  }

  let entropy = length * Math.log2(poolSize(pw));

  const common = COMMON.has(pw.toLowerCase());
  const rep = repetitionShare(pw);
  const seq = sequenceShare(pw);

  if (common) {
    entropy = Math.min(entropy, 10);
    hints.push("common");
  }
  if (rep >= 0.6) {
    entropy *= 0.5;
    hints.push("repeated");
  }
  if (seq >= 0.6) {
    entropy *= 0.5;
    hints.push("sequence");
  }
  if (length < 12) hints.push("short");
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(pw)).length;
  if (classes < 2) hints.push("oneClass");

  let score: StrengthResult["score"];
  if (common || entropy < 28) score = 0;
  else if (entropy < 40) score = 1;
  else if (entropy < 60) score = 2;
  else if (entropy < 80) score = 3;
  else score = 4;

  return {
    length,
    entropy: Math.round(entropy * 10) / 10,
    score,
    crackSeconds: Math.pow(2, entropy) / GUESSES_PER_SECOND,
    hints,
  };
}

/** Human-scale rendering of a crack time. */
export function crackLabel(seconds: number): "instant" | "seconds" | "minutes" | "hours" | "days" | "years" | "ages" {
  if (seconds < 1) return "instant";
  if (seconds < 60) return "seconds";
  if (seconds < 3600) return "minutes";
  if (seconds < 86400) return "hours";
  if (seconds < 31536000) return "days";
  if (seconds < 31536000 * 1e6) return "years";
  return "ages";
}
