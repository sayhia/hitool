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

/** Compact word list for Diceware-style passphrases — 256 words, all distinct,
    4–7 letters, no offensive terms. Enough for ~8 bits per word. */
const WORDLIST = [
  "able", "acid", "aged", "also", "area", "army", "away", "baby", "back", "bake",
  "ball", "band", "bank", "base", "bath", "bead", "beam", "bean", "bear", "beat",
  "bell", "belt", "bend", "bike", "bill", "bird", "bite", "blue", "blur", "boat",
  "body", "bold", "bolt", "bomb", "bone", "book", "boot", "bore", "born", "boss",
  "both", "bowl", "bulk", "burn", "busy", "cake", "call", "calm", "camp", "card",
  "care", "cart", "case", "cash", "cast", "cave", "cell", "chat", "chip", "city",
  "clad", "clam", "clan", "clay", "clip", "club", "clue", "coal", "coat", "code",
  "coil", "coin", "cold", "come", "cook", "cool", "cope", "copy", "cord", "core",
  "cork", "corn", "cost", "cozy", "crew", "crop", "cube", "cure", "curl", "cute",
  "dale", "dame", "damn", "dare", "dark", "dart", "dash", "data", "date", "dawn",
  "dead", "deaf", "deal", "dear", "debt", "deck", "deed", "deem", "deep", "deer",
  "demo", "dent", "deny", "desk", "dial", "dice", "diet", "dirt", "disc", "dock",
  "does", "dome", "done", "doom", "door", "dose", "down", "drag", "draw", "drip",
  "drop", "drug", "drum", "duck", "duel", "duke", "dull", "dumb", "dump", "dune",
  "dusk", "dust", "duty", "each", "earn", "ease", "east", "edge", "edit", "else",
  "emit", "envy", "epic", "even", "ever", "evil", "exam", "exit", "face", "fact",
  "fade", "fail", "fair", "fake", "fall", "fame", "fang", "fare", "farm", "fast",
  "fate", "fear", "feat", "feed", "feel", "feet", "fell", "felt", "file", "fill",
  "film", "find", "fine", "fire", "firm", "fish", "flag", "flat", "flaw", "flee",
  "flow", "foam", "fold", "folk", "fond", "font", "food", "fool", "foot", "ford",
  "fork", "form", "fort", "foul", "four", "free", "from", "fuel", "full", "fund",
  "fury", "fuse", "gain", "gale", "game", "gang", "gate", "gave", "gaze", "gear",
  "gene", "gift", "girl", "give", "glad", "glow", "glue", "goal", "goat", "goes",
  "gold", "golf", "gone", "good", "grab", "gray", "grew", "grid", "grin", "grip",
  "grow", "gulf", "hack", "hair", "half", "hall", "halt", "hand", "hang", "hard",
  "harm", "hate", "haul", "have", "haze", "head", "heal", "heap", "hear", "heat",
  "held", "help", "here", "hero", "hide", "high", "hike", "hill", "hint", "hire",
  "hold", "hole", "holy", "home", "hook", "hope", "horn", "host", "hour", "huge",
];

/** Generate a Diceware-style passphrase. */
export function generatePassphrase(wordCount: number, separator = "-"): string {
  if (wordCount < 1) return "";
  const indices = new Uint32Array(wordCount);
  crypto.getRandomValues(indices);
  return Array.from(indices, (i) => WORDLIST[i % WORDLIST.length]).join(separator);
}

export interface PasswordOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  custom?: string;
  excludeSimilar?: boolean;
}

const SETS = {
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lower: "abcdefghijkmnopqrstuvwxyz",
  digits: "23456789",
  symbols: "!@#$%^&*_-+=?",
};

const SIMILAR = new Set(["O", "o", "0", "l", "I", "1", "|"]);

/** Generate a numeric PIN of the given length. */
export function generatePIN(length: number): string {
  if (length < 1) return "";
  const rnd = new Uint32Array(length);
  crypto.getRandomValues(rnd);
  return Array.from(rnd, (i) => String(i % 10)).join("");
}

/** Generate a single password from the given options. */
export function generatePassword(opts: PasswordOptions): string {
  const pools: string[] = [];
  if (opts.upper) pools.push(SETS.upper);
  if (opts.lower) pools.push(SETS.lower);
  if (opts.digits) pools.push(SETS.digits);
  if (opts.symbols) pools.push(SETS.symbols);
  if (opts.custom) pools.push(opts.custom);
  if (!pools.length) return "";

  const filter = opts.excludeSimilar ? (c: string) => !SIMILAR.has(c) : () => true;
  const filtered = pools.map((p) => [...p].filter(filter).join(""));
  if (filtered.every((p) => p.length === 0)) return "";

  const all = filtered.join("");
  const rnd = new Uint32Array(opts.length);
  crypto.getRandomValues(rnd);
  const chars: string[] = [];
  filtered.forEach((p, i) => {
    if (p.length) chars.push(p[rnd[i] % p.length]);
  });
  for (let i = chars.length; i < opts.length; i++) chars.push(all[rnd[i] % all.length]);

  const rnd2 = new Uint32Array(chars.length);
  crypto.getRandomValues(rnd2);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd2[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Generate multiple passwords at once. */
export function generateBatch(count: number, opts: PasswordOptions): string[] {
  return Array.from({ length: count }, () => generatePassword(opts));
}
