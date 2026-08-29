/**
 * Pixel comparison of two images.
 *
 * The canvas work stays in the view; this takes the two RGBA buffers and
 * answers the questions worth asking about them — how many pixels moved, by
 * how much, and where. Keeping it out of the DOM is what makes the threshold
 * behaviour testable, and the threshold is the whole difficulty: compare
 * strictly and JPEG noise lights up the entire frame.
 */

export interface DiffStats {
  width: number;
  height: number;
  totalPixels: number;
  changedPixels: number;
  /** 0–1. */
  changedRatio: number;
  /** Largest per-pixel distance found, 0–1. */
  maxDelta: number;
  /** Mean per-pixel distance over the whole frame, 0–1. */
  meanDelta: number;
  /** Bounding box of the changes, null when nothing changed. */
  box: { x: number; y: number; w: number; h: number } | null;
}

export interface DiffResult {
  stats: DiffStats;
  /** RGBA overlay: changed pixels marked, unchanged ones faded. */
  overlay: Uint8ClampedArray;
}

/**
 * Perceptual-ish distance between two pixels, 0–1.
 *
 * Straight Euclidean distance in RGB treats a change in blue as heavily as one
 * in green, which does not match what an eye notices; these are the same
 * luminance weights the contrast checker uses, applied to the differences.
 */
function delta(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  i: number,
): number {
  const dr = (a[i] - b[i]) / 255;
  const dg = (a[i + 1] - b[i + 1]) / 255;
  const db = (a[i + 2] - b[i + 2]) / 255;
  const da = (a[i + 3] - b[i + 3]) / 255;
  const colour = Math.sqrt(0.2126 * dr * dr + 0.7152 * dg * dg + 0.0722 * db * db);
  // A pixel that went transparent has changed even if its colour did not.
  return Math.min(1, Math.max(colour, Math.abs(da)));
}

export type Overlay = "mark" | "heat" | "onlyDiff";

export interface DiffOptions {
  /** 0–1; below this a pixel counts as unchanged. Default 0.02. */
  threshold?: number;
  overlay?: Overlay;
  /** Base image drawn under the marks, dimmed to this alpha. */
  dim?: number;
}

/** Marks changed pixels in the app's fail colour, at full strength. */
const MARK: [number, number, number] = [0xcf, 0x3f, 0x45];

export function pixelDiff(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
  opts: DiffOptions = {},
): DiffResult {
  const threshold = Math.min(1, Math.max(0, opts.threshold ?? 0.02));
  const mode: Overlay = opts.overlay ?? "mark";
  const dim = Math.min(1, Math.max(0, opts.dim ?? 0.25));
  const total = width * height;
  const overlay = new Uint8ClampedArray(total * 4);

  let changed = 0;
  let maxDelta = 0;
  let sum = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let p = 0; p < total; p++) {
    const i = p * 4;
    const d = delta(a, b, i);
    sum += d;
    if (d > maxDelta) maxDelta = d;

    if (d > threshold) {
      changed++;
      const x = p % width;
      const y = (p - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (mode === "heat") {
        // Cold to hot across the strength of the change.
        overlay[i] = 255 * Math.min(1, d * 2);
        overlay[i + 1] = 255 * Math.max(0, 1 - Math.abs(d * 2 - 1));
        overlay[i + 2] = 255 * Math.max(0, 1 - d * 2);
        overlay[i + 3] = 255;
      } else {
        overlay[i] = MARK[0];
        overlay[i + 1] = MARK[1];
        overlay[i + 2] = MARK[2];
        overlay[i + 3] = 255;
      }
    } else if (mode === "onlyDiff") {
      overlay[i + 3] = 0;
    } else {
      // Unchanged pixels keep the second image, faded, so the marks have
      // something to sit on and you can see *where* on the picture they are.
      overlay[i] = b[i];
      overlay[i + 1] = b[i + 1];
      overlay[i + 2] = b[i + 2];
      overlay[i + 3] = 255 * dim;
    }
  }

  return {
    overlay,
    stats: {
      width,
      height,
      totalPixels: total,
      changedPixels: changed,
      changedRatio: total ? changed / total : 0,
      maxDelta,
      meanDelta: total ? sum / total : 0,
      box: maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    },
  };
}

/** Percentage with one decimal, for the stats row. */
export function percent(v: number): string {
  const p = v * 100;
  if (p === 0) return "0%";
  if (p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}
