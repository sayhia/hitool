/**
 * Crop rectangle math shared by the crop tool: center-fit an aspect ratio,
 * or clamp user-typed coordinates back into the image. All values are
 * rounded to whole pixels because canvas source rects hate fractions.
 */

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Largest rectangle of ratio rw:rh that fits centered inside the image. */
export function centerAspectCrop(imgW: number, imgH: number, rw: number, rh: number): CropRect {
  const target = rw / rh;
  let w = imgW;
  let h = w / target;
  if (h > imgH) {
    h = imgH;
    w = h * target;
  }
  w = Math.round(w);
  h = Math.round(h);
  return { x: Math.round((imgW - w) / 2), y: Math.round((imgH - h) / 2), w, h };
}

/** Squeezes an arbitrary rect into the image; keeps at least 1×1. */
export function clampRect(rect: CropRect, imgW: number, imgH: number): CropRect {
  const x = Math.min(Math.max(0, Math.round(rect.x)), imgW - 1);
  const y = Math.min(Math.max(0, Math.round(rect.y)), imgH - 1);
  const w = Math.min(Math.max(1, Math.round(rect.w)), imgW - x);
  const h = Math.min(Math.max(1, Math.round(rect.h)), imgH - y);
  return { x, y, w, h };
}
