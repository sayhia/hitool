/**
 * Unit conversion.
 *
 * Every factor here is the exact defined one, not a rounded decimal: an inch
 * is 0.0254 m by definition, a pound is 0.45359237 kg by definition. Rounding
 * those in the table means the tool disagrees with the standard it is quoting.
 *
 * Temperature is the one family that needs an offset as well as a factor, and
 * storage is the one where two different systems share the same words — both
 * are handled explicitly rather than approximated.
 */

export interface Unit {
  id: string;
  /** base = value * factor + offset */
  factor: number;
  offset?: number;
}

export interface UnitFamily {
  id: string;
  base: string;
  units: Unit[];
}

const u = (id: string, factor: number, offset?: number): Unit =>
  offset === undefined ? { id, factor } : { id, factor, offset };

export const FAMILIES: UnitFamily[] = [
  {
    id: "length",
    base: "m",
    units: [
      u("nm", 1e-9),
      u("um", 1e-6),
      u("mm", 1e-3),
      u("cm", 1e-2),
      u("m", 1),
      u("km", 1e3),
      u("in", 0.0254),
      u("ft", 0.3048),
      u("yd", 0.9144),
      u("mi", 1609.344),
      u("nmi", 1852),
      u("li", 500),
      u("chi", 1 / 3),
    ],
  },
  {
    id: "mass",
    base: "kg",
    units: [
      u("mg", 1e-6),
      u("g", 1e-3),
      u("kg", 1),
      u("t", 1e3),
      u("oz", 0.028349523125),
      u("lb", 0.45359237),
      u("st", 6.35029318),
      u("jin", 0.5),
      u("liang", 0.05),
    ],
  },
  {
    id: "area",
    base: "m2",
    units: [
      u("mm2", 1e-6),
      u("cm2", 1e-4),
      u("m2", 1),
      u("km2", 1e6),
      u("ha", 1e4),
      u("acre", 4046.8564224),
      u("ft2", 0.09290304),
      u("mu", 2000 / 3),
    ],
  },
  {
    id: "volume",
    base: "L",
    units: [
      u("mL", 1e-3),
      u("L", 1),
      u("m3", 1e3),
      u("tsp", 0.00492892159375),
      u("tbsp", 0.01478676478125),
      u("cup", 0.2365882365),
      u("floz", 0.0295735295625),
      u("pt", 0.473176473),
      u("qt", 0.946352946),
      u("galUS", 3.785411784),
      u("galUK", 4.54609),
    ],
  },
  {
    id: "temperature",
    base: "C",
    units: [
      u("C", 1, 0),
      // C = (F − 32) × 5/9, written as base = value × factor + offset.
      u("F", 5 / 9, -160 / 9),
      u("K", 1, -273.15),
    ],
  },
  {
    id: "data",
    base: "B",
    units: [
      u("bit", 1 / 8),
      u("B", 1),
      // Decimal and binary prefixes both exist and mean different things; a
      // converter that pretends KB is 1024 is the reason drives "lose" space.
      u("kB", 1e3),
      u("MB", 1e6),
      u("GB", 1e9),
      u("TB", 1e12),
      u("PB", 1e15),
      u("KiB", 1024),
      u("MiB", 1024 ** 2),
      u("GiB", 1024 ** 3),
      u("TiB", 1024 ** 4),
      u("PiB", 1024 ** 5),
    ],
  },
  {
    id: "speed",
    base: "mps",
    units: [
      u("mps", 1),
      u("kmh", 1 / 3.6),
      u("mph", 0.44704),
      u("knot", 1852 / 3600),
      u("mach", 340.3),
      u("c", 299792458),
    ],
  },
  {
    id: "time",
    base: "s",
    units: [
      u("ms", 1e-3),
      u("s", 1),
      u("min", 60),
      u("h", 3600),
      u("d", 86400),
      u("wk", 604800),
      // The Julian year, which is what "a year" means in any exact context.
      u("yr", 31557600),
    ],
  },
  {
    id: "pressure",
    base: "Pa",
    units: [
      u("Pa", 1),
      u("kPa", 1e3),
      u("bar", 1e5),
      u("atm", 101325),
      u("psi", 6894.757293168361),
      u("mmHg", 133.322387415),
    ],
  },
  {
    id: "angle",
    base: "deg",
    units: [
      u("deg", 1),
      u("rad", 180 / Math.PI),
      u("grad", 0.9),
      u("turn", 360),
      u("arcmin", 1 / 60),
      u("arcsec", 1 / 3600),
    ],
  },
];

export function familyOf(id: string): UnitFamily | undefined {
  return FAMILIES.find((f) => f.id === id);
}

function unitOf(family: UnitFamily, id: string): Unit | undefined {
  return family.units.find((x) => x.id === id);
}

/** Convert within one family. Returns null when either unit is unknown. */
export function convert(
  value: number,
  from: string,
  to: string,
  family: UnitFamily,
): number | null {
  const a = unitOf(family, from);
  const b = unitOf(family, to);
  if (!a || !b || !Number.isFinite(value)) return null;
  const base = value * a.factor + (a.offset ?? 0);
  return (base - (b.offset ?? 0)) / b.factor;
}

/** Every unit of a family, given one value in one of them. */
export function convertAll(
  value: number,
  from: string,
  family: UnitFamily,
): { id: string; value: number }[] {
  return family.units
    .map((x) => ({ id: x.id, value: convert(value, from, x.id, family) }))
    .filter((r): r is { id: string; value: number } => r.value !== null);
}

/**
 * Render a converted number without lying about precision.
 *
 * Floating point turns 0.1 + 0.2 into 0.30000000000000004, and a unit table
 * full of that is unreadable; but rounding a very small or very large result
 * to a fixed number of decimals turns it into 0 or into a wall of zeroes. So:
 * significant digits, with exponent notation only where it is genuinely
 * needed, and trailing zeroes trimmed.
 */
export function formatValue(v: number, digits = 10): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1e15 || abs < 1e-9) return v.toExponential(4).replace(/e([+-])(\d)$/, "e$10$2");
  const fixed = v.toPrecision(digits);
  // toPrecision keeps the exponent form for small numbers; expand it, then
  // drop the zeroes it padded on.
  const plain = fixed.includes("e") ? Number(fixed).toString() : fixed;
  return plain.includes(".") ? plain.replace(/\.?0+$/, "") : plain;
}
