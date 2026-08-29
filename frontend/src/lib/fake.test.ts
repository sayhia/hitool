import { describe, expect, it } from "vitest";
import {
  FAKE_KINDS,
  bankCard,
  chineseName,
  generateFake,
  generateRows,
  idChecksum,
  idNumber,
  isValidId,
  isValidLuhn,
  luhnCheck,
  phone,
  plate,
  type Rand,
} from "./fake";

/** Deterministic stand-in for Math.random, so a run can be reproduced. */
function seeded(seed = 1): Rand {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const many = <T>(n: number, f: () => T) => Array.from({ length: n }, f);

describe("idChecksum", () => {
  it("matches published examples", () => {
    // The GB 11643 worked example, plus two computed by hand from the same
    // weights — the point is that the remainder maps through "10X98765432",
    // so a remainder of 2 really is X and not the digit 2.
    expect(idChecksum("11010519491231002")).toBe("X"); // sum 167, mod 2
    expect(idChecksum("44030419900307051")).toBe("X"); // sum 244, mod 2
    expect(idChecksum("11010119900307051")).toBe("3"); // sum 174, mod 9
  });

  it("accepts what it produced", () => {
    const rand = seeded(7);
    for (const id of many(300, () => idNumber(rand))) {
      expect(isValidId(id), id).toBe(true);
    }
  });

  it("rejects a number with a digit changed", () => {
    const id = idNumber(seeded(3));
    const broken = id.slice(0, 5) + String((Number(id[5]) + 1) % 10) + id.slice(6);
    expect(isValidId(broken)).toBe(false);
  });

  it("rejects the wrong shape outright", () => {
    for (const bad of ["", "123", "11010519491231002Y", "1101051949123100211"]) {
      expect(isValidId(bad), bad).toBe(false);
    }
  });

  it("uses X only where the remainder calls for it", () => {
    const ids = many(400, () => idNumber(seeded(Math.floor(Math.random() * 1e6))));
    const withX = ids.filter((i) => i.endsWith("X"));
    // Roughly one in eleven; the test only cares that it happens and that the
    // character never turns up anywhere but the last position.
    expect(withX.length).toBeGreaterThan(0);
    for (const id of ids) expect(id.slice(0, 17)).toMatch(/^\d{17}$/);
  });
});

describe("luhn", () => {
  it("matches the canonical test numbers", () => {
    expect(isValidLuhn("4539578763621486")).toBe(true);
    expect(isValidLuhn("79927398713")).toBe(true);
    expect(isValidLuhn("79927398710")).toBe(false);
  });

  it("computes the digit that completes a number", () => {
    expect(luhnCheck("7992739871")).toBe("3");
  });

  it("accepts every card it generated", () => {
    const rand = seeded(11);
    for (const card of many(300, () => bankCard(rand))) {
      expect(card, card).toMatch(/^\d{19}$/);
      expect(isValidLuhn(card), card).toBe(true);
    }
  });

  it("catches a single transposed pair, which is the point of Luhn", () => {
    const card = bankCard(seeded(5));
    const swapped = card.slice(0, 7) + card[8] + card[7] + card.slice(9);
    // Luhn only misses a transposition of 09/90; anything else must be caught.
    if (card[7] !== card[8] && !((card[7] === "0" && card[8] === "9") || (card[7] === "9" && card[8] === "0"))) {
      expect(isValidLuhn(swapped)).toBe(false);
    }
  });

  it("ignores spaces and dashes when checking", () => {
    expect(isValidLuhn("4539 5787 6362 1486")).toBe(true);
    expect(isValidLuhn("4539-5787-6362-1486")).toBe(true);
  });

  it("rejects a non-number", () => {
    expect(isValidLuhn("")).toBe(false);
    expect(isValidLuhn("abcd")).toBe(false);
  });
});

describe("phone", () => {
  it("is eleven digits behind a real prefix", () => {
    const rand = seeded(2);
    for (const p of many(200, () => phone(rand))) {
      expect(p, p).toMatch(/^1[3-9]\d{9}$/);
    }
  });
});

describe("chineseName", () => {
  it("is two or three characters", () => {
    const rand = seeded(4);
    for (const n of many(200, () => chineseName(rand))) {
      expect(n.length, n).toBeGreaterThanOrEqual(2);
      expect(n.length, n).toBeLessThanOrEqual(3);
      expect(n, n).toMatch(/^[一-鿿]+$/);
    }
  });
});

describe("plate", () => {
  it("never uses the letters a plate leaves out", () => {
    // I and O read as 1 and 0, so they are not issued.
    const all = many(300, () => plate(seeded(Math.floor(Math.random() * 1e6)))).join("");
    expect(all.slice(1)).not.toMatch(/[IO]/);
  });

  it("has the province character then seven more", () => {
    const rand = seeded(6);
    for (const p of many(100, () => plate(rand))) {
      expect(p, p).toMatch(/^[一-鿿][A-HJ-NP-Z][A-HJ-NP-Z0-9]{5}$/);
    }
  });
});

describe("generateFake", () => {
  it("covers every declared kind", () => {
    for (const kind of FAKE_KINDS) {
      const rows = generateFake(kind, 3, seeded(9));
      expect(rows, kind).toHaveLength(3);
      for (const v of rows) expect(v.length, `${kind}: ${v}`).toBeGreaterThan(0);
    }
  });

  it("clamps the count", () => {
    expect(generateFake("name", 99999)).toHaveLength(1000);
    expect(generateFake("name", 0)).toHaveLength(1);
    expect(generateFake("name", -3)).toHaveLength(1);
  });

  it("varies its output", () => {
    const names = new Set(generateFake("name", 200));
    expect(names.size).toBeGreaterThan(50);
  });

  it("reproduces a run from the same seed", () => {
    expect(generateFake("id", 5, seeded(42))).toEqual(generateFake("id", 5, seeded(42)));
    expect(generateFake("id", 5, seeded(42))).not.toEqual(generateFake("id", 5, seeded(43)));
  });
});

describe("generateRows", () => {
  it("builds one row per person with a column per kind", () => {
    const rows = generateRows(["name", "phone", "id"], 4, seeded(8));
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r).toHaveLength(3);
      expect(r[1]).toMatch(/^1[3-9]\d{9}$/);
      expect(isValidId(r[2])).toBe(true);
    }
  });

  it("handles an empty column list without throwing", () => {
    expect(generateRows([], 2)).toEqual([[], []]);
  });
});
