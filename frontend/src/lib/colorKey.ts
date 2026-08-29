/**
 * Chroma-key on raw RGBA pixels: knocks out pixels close to the picked
 * colour, with a short feather band so edges don't look scissor-cut. Pure
 * function over ImageData so the view and the tests share one code path.
 */

export interface KeyResult {
  /** Pixels pushed fully transparent. */
  removed: number;
  total: number;
}

/**
 * Mutates `data` in place. `tolerance` is 0-150-ish: the radius of the
 * knockout sphere in RGB space; the outer 40% of the radius feathers.
 */
export function removeColorKey(
  data: Uint8ClampedArray,
  key: [number, number, number],
  tolerance: number,
): KeyResult {
  const tol = Math.max(1, tolerance);
  const outer = tol * tol * 3;
  const inner = outer * 0.6;
  const [kr, kg, kb] = key;

  let removed = 0;
  const total = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - kr;
    const dg = data[i + 1] - kg;
    const db = data[i + 2] - kb;
    const d2 = dr * dr + dg * dg + db * db;
    if (d2 <= inner) {
      data[i + 3] = 0;
      removed++;
    } else if (d2 <= outer) {
      // Feather: fade alpha across the band instead of a hard rim.
      const f = (d2 - inner) / (outer - inner);
      data[i + 3] = Math.round(data[i + 3] * f);
    }
  }
  return { removed, total };
}

/** Reads "#rrggbb" / "#rgb" into a channel triple; null when malformed. */
export function parseHexColor(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
