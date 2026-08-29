import { describe, expect, it } from "vitest";
import {
  NANO_ALPHABET,
  cryptoBytes,
  generate,
  nanoId,
  ulid,
  uuidV4,
  uuidV7,
  type ByteSource,
} from "./ids";

/** Fixed bytes, so an id can be asserted exactly rather than by shape. */
const fill = (v: number): ByteSource => (n) => new Uint8Array(n).fill(v);
/** Counting bytes, to see every position land where it should. */
const counter = (): ByteSource => {
  let i = 0;
  return (n) => Uint8Array.from({ length: n }, () => i++ & 0xff);
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("uuidV4", () => {
  it("has the canonical shape", () => {
    expect(uuidV4()).toMatch(UUID_RE);
  });

  it("stamps version 4 and the RFC 4122 variant", () => {
    for (const src of [fill(0x00), fill(0xff), counter(), cryptoBytes]) {
      const u = uuidV4(src);
      expect(u[14], u).toBe("4");
      expect("89ab", u).toContain(u[19]);
    }
  });

  it("keeps every other bit of the source", () => {
    expect(uuidV4(fill(0xff))).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(uuidV4(fill(0x00))).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 500 }, () => uuidV4()));
    expect(seen.size).toBe(500);
  });
});

describe("uuidV7", () => {
  it("has the canonical shape and version 7", () => {
    const u = uuidV7(Date.now());
    expect(u).toMatch(UUID_RE);
    expect(u[14]).toBe("7");
    expect("89ab").toContain(u[19]);
  });

  it("writes the timestamp into the leading 48 bits", () => {
    // 2026-08-04T00:00:00Z = 1785801600000 ms = 0x019FCA11EC00
    const u = uuidV7(1785801600000, fill(0));
    expect(u.slice(0, 13)).toBe("019fca11-ec00");
  });

  it("stays exact past the 32-bit boundary", () => {
    // A naive shift would wrap; 2^40 ms is well past what `<<` can hold.
    const u = uuidV7(2 ** 40, fill(0));
    expect(u.slice(0, 13)).toBe("01000000-0000");
  });

  it("sorts by creation time as a plain string", () => {
    // The reason to prefer it over v4 for a primary key.
    const ids = [1000, 2000, 3000, 4000].map((t) => uuidV7(t, cryptoBytes));
    expect([...ids].sort()).toEqual(ids);
  });

  it("differs between two calls in the same millisecond", () => {
    const a = uuidV7(1234, cryptoBytes);
    const b = uuidV7(1234, cryptoBytes);
    expect(a).not.toBe(b);
    expect(a.slice(0, 13)).toBe(b.slice(0, 13));
  });

  it("treats a negative clock as zero rather than emitting junk", () => {
    expect(uuidV7(-5, fill(0)).slice(0, 13)).toBe("00000000-0000");
  });
});

describe("ulid", () => {
  it("is 26 characters of Crockford base32", () => {
    const v = ulid();
    expect(v).toHaveLength(26);
    expect(v).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
  });

  it("never emits the letters Crockford leaves out", () => {
    const all = Array.from({ length: 200 }, () => ulid()).join("");
    for (const ch of "ILOU") expect(all, ch).not.toContain(ch);
  });

  it("encodes the timestamp in the first ten characters", () => {
    expect(ulid(0, fill(0)).slice(0, 10)).toBe("0000000000");
    expect(ulid(1, fill(0)).slice(0, 10)).toBe("0000000001");
    expect(ulid(32, fill(0)).slice(0, 10)).toBe("0000000010");
  });

  it("sorts lexicographically by time", () => {
    const ids = [1, 1000, 1_000_000, 1_785_801_600_000].map((t) => ulid(t));
    expect([...ids].sort()).toEqual(ids);
  });

  it("draws each random symbol from a whole byte", () => {
    // Taking a byte modulo 32 would bias the first eight symbols; masking the
    // low five bits gives each symbol an equal share.
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      for (const ch of ulid(0).slice(10)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    expect(counts.size).toBe(32);
    const values = [...counts.values()];
    expect(Math.min(...values) / Math.max(...values)).toBeGreaterThan(0.7);
  });
});

describe("nanoId", () => {
  it("has the requested length", () => {
    expect(nanoId()).toHaveLength(21);
    expect(nanoId(8)).toHaveLength(8);
    expect(nanoId(64)).toHaveLength(64);
  });

  it("uses only the alphabet", () => {
    const v = nanoId(200);
    for (const ch of v) expect(NANO_ALPHABET, ch).toContain(ch);
  });

  it("accepts a custom alphabet", () => {
    expect(nanoId(30, "01")).toMatch(/^[01]{30}$/);
    expect(nanoId(12, "ABC")).toMatch(/^[ABC]{12}$/);
  });

  it("rejects an alphabet too small to encode anything", () => {
    expect(() => nanoId(10, "x")).toThrow();
  });

  it("clamps a nonsensical size instead of returning nothing", () => {
    expect(nanoId(0)).toHaveLength(1);
    expect(nanoId(-4)).toHaveLength(1);
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 500 }, () => nanoId()));
    expect(seen.size).toBe(500);
  });
});

describe("generate", () => {
  it("returns the requested number of ids", () => {
    expect(generate("uuid4", { count: 5 })).toHaveLength(5);
    expect(generate("ulid", { count: 3 })).toHaveLength(3);
  });

  it("clamps the count to something a pane can hold", () => {
    expect(generate("nano", { count: 100000 })).toHaveLength(1000);
    expect(generate("nano", { count: 0 })).toHaveLength(1);
  });

  it("applies compact and uppercase to UUIDs", () => {
    const [v] = generate("uuid4", { compact: true, uppercase: true, bytes: fill(0xff) });
    expect(v).toBe("FFFFFFFFFFFF4FFFBFFFFFFFFFFFFFFF");
  });

  it("leaves ULID and Nano ID alone", () => {
    // ULID is defined in upper case; Nano ID's alphabet is case-sensitive, so
    // folding either would produce an id that is no longer what it claims.
    const [u] = generate("ulid", { compact: true, uppercase: false });
    expect(u).toMatch(/^[0-9A-Z]{26}$/);
    const [n] = generate("nano", { uppercase: true, size: 40 });
    expect(n).not.toBe(n.toUpperCase());
  });

  it("honours the Nano ID size", () => {
    expect(generate("nano", { size: 10 })[0]).toHaveLength(10);
  });

  it("gives every kind the shape it promises", () => {
    expect(generate("uuid4")[0]).toMatch(UUID_RE);
    expect(generate("uuid7")[0]).toMatch(UUID_RE);
    expect(generate("ulid")[0]).toHaveLength(26);
    expect(generate("nano")[0]).toHaveLength(21);
  });
});
