/**
 * Semantic versions: parsing, comparison, and the range operators people
 * actually reach for (=, >, >=, <, <=, ^, ~, and plain spaces meaning AND).
 *
 * Pre-release ordering follows the spec: a version with a pre-release tag is
 * *lower* than the same version without one, and pre-release identifiers
 * compare numerically when both are numeric.
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  build: string[];
}

const RE =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseSemVer(text: string): SemVer | null {
  const m = RE.exec(text.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split(".") : [],
    build: m[5] ? m[5].split(".") : [],
  };
}

/** -1 / 0 / 1, build metadata ignored per the spec. */
export function compareSemVer(a: SemVer, b: SemVer): number {
  for (const k of ["major", "minor", "patch"] as const) {
    if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  }
  const ap = a.prerelease;
  const bp = b.prerelease;
  if (!ap.length && !bp.length) return 0;
  if (!ap.length) return 1; // release beats pre-release
  if (!bp.length) return -1;
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const x = ap[i];
    const y = bp[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
    } else if (nx !== ny) {
      return nx ? -1 : 1; // numeric identifiers rank below textual ones
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

function bumpTo(v: SemVer, kind: "major" | "minor"): SemVer {
  if (kind === "major") return { major: v.major + 1, minor: 0, patch: 0, prerelease: [], build: [] };
  return { major: v.major, minor: v.minor + 1, patch: 0, prerelease: [], build: [] };
}

/** Does `version` satisfy one comparator like ">=1.2.0" or "^2.0.0"? */
export function satisfiesOne(version: SemVer, comp: string): boolean {
  const m = /^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(comp.trim());
  if (!m) return false;
  const op = m[1] ?? "=";
  const bound = parseSemVer(m[2]);
  if (!bound) return false;
  const c = compareSemVer(version, bound);

  switch (op) {
    case "=":
      return c === 0;
    case ">":
      return c > 0;
    case ">=":
      return c >= 0;
    case "<":
      return c < 0;
    case "<=":
      return c <= 0;
    case "^": {
      // Compatible with: up to the next breaking bump. 0.x locks the minor,
      // 0.0.x locks the patch — the npm convention.
      if (c < 0) return false;
      const ceil = bound.major > 0 ? bumpTo(bound, "major") : bound.minor > 0 ? bumpTo(bound, "minor") : { ...bound, prerelease: [], build: [] };
      if (bound.major === 0 && bound.minor === 0) {
        return version.major === 0 && version.minor === 0 && version.patch === bound.patch;
      }
      return compareSemVer(version, ceil) < 0;
    }
    case "~": {
      // Patch-level changes only.
      if (c < 0) return false;
      return version.major === bound.major && version.minor === bound.minor;
    }
  }
  return false;
}

/** Space-separated comparators are ANDed; "||" groups are ORed. */
export function satisfies(versionText: string, rangeText: string): boolean | null {
  const version = parseSemVer(versionText);
  if (!version) return null;
  const range = rangeText.trim();
  if (!range) return true;
  return range.split("||").some((group) => {
    const comps = group.trim().split(/\s+/).filter(Boolean);
    // ">=" + "1.2.0" written apart still means one comparator when the
    // operator sits alone; glue an operator-only token to its neighbour.
    const glued: string[] = [];
    for (let i = 0; i < comps.length; i++) {
      if (/^(>=|<=|>|<|=|\^|~)$/.test(comps[i]) && i + 1 < comps.length) {
        glued.push(comps[i] + comps[++i]);
      } else {
        glued.push(comps[i]);
      }
    }
    return glued.every((c) => satisfiesOne(version, c));
  });
}
