/**
 * Identifier generation: UUID v4 / v7, ULID and Nano ID.
 *
 * All four take their randomness from an injectable byte source so the tests
 * can pin exact output; the default is `crypto.getRandomValues`, never
 * `Math.random` — these end up in databases and URLs, and a predictable id is
 * a real problem in both places.
 */

export type ByteSource = (n: number) => Uint8Array;

export const cryptoBytes: ByteSource = (n) => crypto.getRandomValues(new Uint8Array(n));

const hex = (b: number) => b.toString(16).padStart(2, "0");

function format(bytes: Uint8Array): string {
  const s = Array.from(bytes, hex).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** Set the 4-bit version and the 2-bit RFC 4122 variant in place. */
function stamp(bytes: Uint8Array, version: number): Uint8Array {
  bytes[6] = (bytes[6] & 0x0f) | (version << 4);
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes;
}

/** Random UUID. 122 bits of entropy; the other six say v4 and RFC 4122. */
export function uuidV4(bytes: ByteSource = cryptoBytes): string {
  return format(stamp(bytes(16), 4));
}

/**
 * Time-ordered UUID (RFC 9562 v7): a 48-bit millisecond timestamp followed by
 * randomness. Sorts by creation time as a string, which is why it is worth
 * having beside v4 — a v4 primary key scatters index writes across the tree.
 */
export function uuidV7(at: number = Date.now(), bytes: ByteSource = cryptoBytes): string {
  const b = new Uint8Array(16);
  const ms = Math.max(0, Math.floor(at));
  // 48 bits, big-endian. Math over the low 32 bits keeps this exact past 2^32.
  b[0] = Math.floor(ms / 2 ** 40) & 0xff;
  b[1] = Math.floor(ms / 2 ** 32) & 0xff;
  b[2] = Math.floor(ms / 2 ** 24) & 0xff;
  b[3] = Math.floor(ms / 2 ** 16) & 0xff;
  b[4] = Math.floor(ms / 2 ** 8) & 0xff;
  b[5] = ms & 0xff;
  b.set(bytes(10), 6);
  return format(stamp(b, 7));
}

/** Crockford base32: no I, L, O or U, so nothing reads as another character. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * ULID: 26 characters, the first 10 encoding the millisecond timestamp. Sorts
 * lexicographically by time and survives being typed out loud, which is the
 * trade it makes against UUID.
 */
export function ulid(at: number = Date.now(), bytes: ByteSource = cryptoBytes): string {
  let ms = Math.max(0, Math.floor(at));
  const time: string[] = [];
  for (let i = 0; i < 10; i++) {
    time.unshift(CROCKFORD[ms % 32]);
    ms = Math.floor(ms / 32);
  }
  // 16 characters of randomness, one base32 digit each — drawing a byte per
  // digit and taking it modulo 32 would bias the first eight symbols.
  const rnd = Array.from(bytes(16), (b) => CROCKFORD[b & 0x1f]);
  return time.join("") + rnd.join("");
}

export const NANO_ALPHABET = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict";

/**
 * Nano ID: URL-safe, shorter than a UUID at comparable collision odds.
 *
 * The alphabet is masked to a power of two and out-of-range draws are
 * discarded rather than folded, because folding would make the first few
 * symbols more likely — the whole point of the id is that it is uniform.
 */
export function nanoId(
  size = 21,
  alphabet: string = NANO_ALPHABET,
  bytes: ByteSource = cryptoBytes,
): string {
  const n = Math.max(1, Math.floor(size));
  if (alphabet.length < 2) throw new Error("alphabet needs at least two symbols");
  const mask = (2 << Math.floor(Math.log2(alphabet.length - 1))) - 1;
  const step = Math.ceil((1.6 * mask * n) / alphabet.length);
  let out = "";
  // Bounded so a hostile byte source cannot spin here forever.
  for (let round = 0; out.length < n && round < 1000; round++) {
    const chunk = bytes(step);
    for (const b of chunk) {
      const c = alphabet[b & mask];
      if (c !== undefined) {
        out += c;
        if (out.length === n) break;
      }
    }
  }
  return out;
}

export type IdKind = "uuid4" | "uuid7" | "ulid" | "nano";

export interface GenOptions {
  count?: number;
  /** Strip the hyphens from a UUID; ignored by the other kinds. */
  compact?: boolean;
  uppercase?: boolean;
  /** Nano ID length. */
  size?: number;
  at?: number;
  bytes?: ByteSource;
}

export function generate(kind: IdKind, opts: GenOptions = {}): string[] {
  const count = Math.min(1000, Math.max(1, Math.floor(opts.count ?? 1)));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let v =
      kind === "uuid4"
        ? uuidV4(opts.bytes)
        : kind === "uuid7"
          ? uuidV7(opts.at, opts.bytes)
          : kind === "ulid"
            ? ulid(opts.at, opts.bytes)
            : nanoId(opts.size, NANO_ALPHABET, opts.bytes);
    // ULID is defined in upper case and Nano ID's alphabet is case-sensitive,
    // so case folding only ever applies to the two UUID kinds.
    if (kind === "uuid4" || kind === "uuid7") {
      if (opts.compact) v = v.replace(/-/g, "");
      if (opts.uppercase) v = v.toUpperCase();
    }
    out.push(v);
  }
  return out;
}
