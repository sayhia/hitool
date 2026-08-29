/**
 * Shared plumbing for popup menus: one item shape, one placement rule, so
 * every menu in the app behaves the same and never renders off-screen.
 */

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  /** Draws a check mark — for "which one is active" entries. */
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Faint detail text on the right, e.g. a shortcut hint. */
  detail?: string;
}

export interface MenuPos {
  x: number;
  y: number;
}

const MARGIN = 8;

/**
 * Clamp a w×h menu to the viewport. Opens down-right of the anchor point by
 * default; flips up when it would overflow below. The viewport is a
 * parameter so the rule is testable without a DOM.
 */
export function placeMenu(
  x: number,
  y: number,
  w: number,
  h: number,
  vw = window.innerWidth,
  vh = window.innerHeight,
): MenuPos {
  let px = x;
  let py = y;
  if (px + w > vw - MARGIN) px = Math.max(MARGIN, vw - MARGIN - w);
  if (py + h > vh - MARGIN) py = Math.max(MARGIN, y - h);
  return { x: px, y: py };
}
