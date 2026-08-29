/**
 * Raffle drawing: split a list of names into winners, fairly.
 *
 * Randomness comes from crypto.getRandomValues by default — Math.random is
 * fine for games, but a prize draw people argue about deserves the better
 * source. The rng is injectable so tests can pin it down.
 */

export type Rng = () => number;

/** Uniform [0, 1) from 32 random bits. */
export function cryptoRng(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}

/**
 * One name per line. Blank lines drop out; surrounding whitespace is trimmed
 * but inside spacing survives — "Wang  Xiao" is a different entry from
 * "Wang Xiao" only if the user says so.
 */
export function parsePool(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** First-wins deduplication, keeping the original order. */
export function uniqueNames(pool: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of pool) {
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/**
 * Draw `count` winners. With `unique` the pool is deduplicated first, so one
 * person cannot win twice; without it, two entries with the same name are
 * treated as two tickets. Either way the count is capped by the number of
 * tickets — you cannot draw what is not in the drum.
 *
 * Selection is a partial Fisher–Yates: shuffle only the prefix that gets
 * returned, so a million-name pool costs O(count), not O(pool).
 */
export function pickWinners(
  pool: string[],
  count: number,
  opts: { unique?: boolean; rng?: Rng } = {},
): string[] {
  const rng = opts.rng ?? cryptoRng;
  const names = opts.unique === false ? [...pool] : uniqueNames(pool);
  const want = Math.min(Math.max(0, count), names.length);
  for (let i = 0; i < want; i++) {
    const j = i + Math.floor(rng() * (names.length - i));
    const tmp = names[i];
    names[i] = names[j];
    names[j] = tmp;
  }
  return names.slice(0, want);
}
