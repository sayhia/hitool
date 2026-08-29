import { describe, expect, it } from "vitest";
import { FAMILIES, convert, convertAll, familyOf, formatValue } from "./units";

const at = (id: string) => familyOf(id)!;
const conv = (v: number, from: string, to: string, fam: string) =>
  convert(v, from, to, at(fam))!;

describe("length", () => {
  it("uses the defined inch and mile, not a rounded one", () => {
    expect(conv(1, "in", "mm", "length")).toBeCloseTo(25.4, 12);
    expect(conv(1, "mi", "m", "length")).toBeCloseTo(1609.344, 12);
    expect(conv(1, "ft", "in", "length")).toBeCloseTo(12, 12);
    expect(conv(1, "yd", "ft", "length")).toBeCloseTo(3, 12);
  });

  it("handles the Chinese units", () => {
    expect(conv(1, "li", "m", "length")).toBe(500);
    expect(conv(3, "chi", "m", "length")).toBeCloseTo(1, 12);
  });

  it("round-trips through the base", () => {
    for (const unit of at("length").units) {
      const there = conv(7.25, "m", unit.id, "length");
      expect(conv(there, unit.id, "m", "length"), unit.id).toBeCloseTo(7.25, 9);
    }
  });
});

describe("mass", () => {
  it("uses the defined pound and ounce", () => {
    expect(conv(1, "lb", "kg", "mass")).toBeCloseTo(0.45359237, 12);
    expect(conv(1, "lb", "oz", "mass")).toBeCloseTo(16, 10);
    expect(conv(1, "st", "lb", "mass")).toBeCloseTo(14, 8);
  });

  it("handles jin and liang", () => {
    expect(conv(1, "jin", "g", "mass")).toBeCloseTo(500, 10);
    expect(conv(1, "jin", "liang", "mass")).toBeCloseTo(10, 10);
  });
});

describe("temperature", () => {
  it("matches the fixed points", () => {
    expect(conv(0, "C", "F", "temperature")).toBeCloseTo(32, 10);
    expect(conv(100, "C", "F", "temperature")).toBeCloseTo(212, 10);
    expect(conv(-40, "C", "F", "temperature")).toBeCloseTo(-40, 10);
    expect(conv(0, "C", "K", "temperature")).toBeCloseTo(273.15, 10);
    expect(conv(-273.15, "C", "K", "temperature")).toBeCloseTo(0, 10);
  });

  it("converts between the two non-base scales", () => {
    // F → K goes through C, which is where an offset-free table gets it wrong.
    expect(conv(32, "F", "K", "temperature")).toBeCloseTo(273.15, 10);
    expect(conv(212, "F", "K", "temperature")).toBeCloseTo(373.15, 10);
    expect(conv(0, "K", "F", "temperature")).toBeCloseTo(-459.67, 8);
  });

  it("round-trips", () => {
    for (const unit of ["C", "F", "K"]) {
      const there = conv(21.5, "C", unit, "temperature");
      expect(conv(there, unit, "C", "temperature"), unit).toBeCloseTo(21.5, 9);
    }
  });
});

describe("data", () => {
  it("keeps decimal and binary prefixes apart", () => {
    // A converter that says KB is 1024 is why drives look like they "lost" space.
    expect(conv(1, "kB", "B", "data")).toBe(1000);
    expect(conv(1, "KiB", "B", "data")).toBe(1024);
    expect(conv(1, "GiB", "B", "data")).toBe(1073741824);
    expect(conv(1, "GB", "B", "data")).toBe(1e9);
  });

  it("shows the gap that trips people up", () => {
    // A "1 TB" drive shows as ~931 GiB.
    expect(conv(1, "TB", "GiB", "data")).toBeCloseTo(931.32, 2);
  });

  it("counts eight bits to the byte", () => {
    expect(conv(8, "bit", "B", "data")).toBe(1);
    expect(conv(1, "MB", "bit", "data")).toBe(8e6);
  });
});

describe("speed", () => {
  it("matches the usual equivalences", () => {
    expect(conv(1, "kmh", "mps", "speed")).toBeCloseTo(1 / 3.6, 12);
    expect(conv(100, "kmh", "mph", "speed")).toBeCloseTo(62.137, 3);
    expect(conv(1, "knot", "kmh", "speed")).toBeCloseTo(1.852, 10);
  });
});

describe("angle", () => {
  it("converts degrees and radians", () => {
    expect(conv(180, "deg", "rad", "angle")).toBeCloseTo(Math.PI, 12);
    expect(conv(1, "turn", "deg", "angle")).toBe(360);
    expect(conv(1, "deg", "arcmin", "angle")).toBeCloseTo(60, 10);
    expect(conv(400, "grad", "deg", "angle")).toBeCloseTo(360, 10);
  });
});

describe("time", () => {
  it("uses the Julian year", () => {
    expect(conv(1, "yr", "d", "time")).toBeCloseTo(365.25, 10);
    expect(conv(1, "d", "s", "time")).toBe(86400);
    expect(conv(1, "wk", "h", "time")).toBe(168);
  });
});

describe("pressure", () => {
  it("matches the standard atmosphere", () => {
    expect(conv(1, "atm", "Pa", "pressure")).toBe(101325);
    expect(conv(1, "atm", "psi", "pressure")).toBeCloseTo(14.6959, 4);
    expect(conv(1, "bar", "kPa", "pressure")).toBeCloseTo(100, 10);
    expect(conv(760, "mmHg", "atm", "pressure")).toBeCloseTo(1, 6);
  });
});

describe("convert", () => {
  it("returns null for an unknown unit", () => {
    expect(convert(1, "nope", "m", at("length"))).toBeNull();
    expect(convert(1, "m", "nope", at("length"))).toBeNull();
  });

  it("returns null rather than NaN for a non-number", () => {
    expect(convert(NaN, "m", "km", at("length"))).toBeNull();
    expect(convert(Infinity, "m", "km", at("length"))).toBeNull();
  });

  it("is the identity when the units match", () => {
    for (const f of FAMILIES) {
      for (const unit of f.units) {
        expect(convert(3.7, unit.id, unit.id, f), `${f.id}.${unit.id}`).toBeCloseTo(3.7, 9);
      }
    }
  });

  it("round-trips every unit of every family", () => {
    for (const f of FAMILIES) {
      for (const unit of f.units) {
        const there = convert(12.5, f.base, unit.id, f)!;
        expect(convert(there, unit.id, f.base, f), `${f.id}.${unit.id}`).toBeCloseTo(12.5, 6);
      }
    }
  });
});

describe("convertAll", () => {
  it("returns one row per unit of the family", () => {
    const rows = convertAll(1, "m", at("length"));
    expect(rows).toHaveLength(at("length").units.length);
    expect(rows.find((r) => r.id === "cm")!.value).toBeCloseTo(100, 10);
  });
});

describe("the table itself", () => {
  it("names a base unit that exists in every family", () => {
    for (const f of FAMILIES) {
      expect(f.units.some((x) => x.id === f.base), f.id).toBe(true);
    }
  });

  it("gives the base unit a factor of one and no offset", () => {
    for (const f of FAMILIES) {
      const base = f.units.find((x) => x.id === f.base)!;
      expect(base.factor, f.id).toBe(1);
      expect(base.offset ?? 0, f.id).toBe(0);
    }
  });

  it("uses unique unit ids within a family", () => {
    for (const f of FAMILIES) {
      const ids = f.units.map((x) => x.id);
      expect(new Set(ids).size, f.id).toBe(ids.length);
    }
  });

  it("has no zero or negative factors", () => {
    for (const f of FAMILIES) {
      for (const x of f.units) expect(x.factor, `${f.id}.${x.id}`).toBeGreaterThan(0);
    }
  });
});

describe("formatValue", () => {
  it("does not show floating point noise", () => {
    expect(formatValue(0.1 + 0.2)).toBe("0.3");
    expect(formatValue(1 / 3)).toBe("0.3333333333");
  });

  it("keeps whole numbers whole", () => {
    expect(formatValue(1000)).toBe("1000");
    expect(formatValue(1)).toBe("1");
    expect(formatValue(0)).toBe("0");
  });

  it("does not round a small value away to zero", () => {
    expect(formatValue(0.000001)).not.toBe("0");
    expect(formatValue(1e-12)).toContain("e-");
  });

  it("uses exponent form only at the extremes", () => {
    expect(formatValue(123456789)).not.toContain("e");
    expect(formatValue(1e20)).toContain("e+");
  });

  it("keeps the sign", () => {
    expect(formatValue(-40)).toBe("-40");
  });

  it("says so when there is no number", () => {
    expect(formatValue(NaN)).toBe("—");
    expect(formatValue(Infinity)).toBe("—");
  });
});
