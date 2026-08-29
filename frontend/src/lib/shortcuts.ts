/**
 * Customisable keyboard shortcuts. Combos are stored as strings like
 * "mod+alt+arrowright" — "mod" means ⌘ on macOS and Ctrl elsewhere, which is
 * what the rest of the app already does, so a saved binding stays correct
 * after moving the same settings file between machines.
 */
import * as StoreService from "@bindings/hitool/services/storeservice";
import { inWails } from "./backend";
import { isMacUi } from "./platform";

export type ShortcutAction =
  | "palette"
  | "closeTab"
  | "toggleDock"
  | "toggleInspector"
  | "toggleSidebar"
  | "openSettings"
  | "cycleNext"
  | "cyclePrev";

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  "palette",
  "closeTab",
  "toggleDock",
  "toggleInspector",
  "toggleSidebar",
  "openSettings",
  "cycleNext",
  "cyclePrev",
];

export const DEFAULT_COMBOS: Record<ShortcutAction, string> = {
  palette: "mod+k",
  closeTab: "mod+w",
  toggleDock: "mod+j",
  toggleInspector: "mod+i",
  toggleSidebar: "mod+b",
  openSettings: "mod+,",
  cycleNext: "mod+alt+arrowright",
  cyclePrev: "mod+alt+arrowleft",
};

export interface Combo {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

const MODIFIERS = new Set(["mod", "alt", "shift"]);

/** Multi-character keys a binding may legitimately use. */
const NAMED_KEYS = new Set([
  "arrowleft",
  "arrowright",
  "arrowup",
  "arrowdown",
  "escape",
  "enter",
  "backspace",
  "delete",
  "home",
  "end",
  "pageup",
  "pagedown",
  "space",
  "tab",
]);

/** Single printable char or a known named key — anything else is garbage. */
function isRealKey(k: string): boolean {
  return k.length === 1 || NAMED_KEYS.has(k);
}

export function parseCombo(s: string): Combo | null {
  const parts = s.toLowerCase().split("+").filter(Boolean);
  if (!parts.length) return null;
  const combo: Combo = { mod: false, alt: false, shift: false, key: "" };
  for (const p of parts) {
    if (p === "mod") combo.mod = true;
    else if (p === "alt") combo.alt = true;
    else if (p === "shift") combo.shift = true;
    else if (!MODIFIERS.has(p)) combo.key = p;
  }
  // A combo without a real key (only modifiers) can never fire.
  if (!combo.key || !isRealKey(combo.key)) return null;
  return combo;
}

/** True when the event carries exactly this combo — no extra modifiers. */
export function matches(e: KeyboardEvent, s: string): boolean {
  const combo = parseCombo(s);
  if (!combo) return false;
  if ((e.metaKey || e.ctrlKey) !== combo.mod) return false;
  if (e.altKey !== combo.alt) return false;
  if (e.shiftKey !== combo.shift) return false;
  return e.key.toLowerCase() === combo.key;
}

/**
 * Record a combo from a keydown while the user is rebinding. Modifier-only
 * presses return null so the recorder keeps waiting.
 */
export function comboFromEvent(e: KeyboardEvent): string | null {
  const key = e.key.toLowerCase();
  if (["meta", "control", "alt", "shift"].includes(key)) return null;
  if (!isRealKey(key)) return null; // IME garbage or unknown keys can't become bindings
  const mod = e.metaKey || e.ctrlKey;
  if (!mod && !e.altKey) return null; // bare keys collide with typing and category jumps
  const parts: string[] = [];
  if (mod) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

const isMac = isMacUi();

const KEY_GLYPHS: Record<string, string> = {
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  escape: "Esc",
  enter: "↵",
};

/** Human-readable form for the settings list: ⌘K on macOS, Ctrl+K elsewhere. */
export function comboText(s: string): string {
  const combo = parseCombo(s);
  if (!combo) return s;
  const parts: string[] = [];
  if (isMac) {
    if (combo.mod) parts.push("⌘");
    if (combo.alt) parts.push("⌥");
    if (combo.shift) parts.push("⇧");
    parts.push(KEY_GLYPHS[combo.key] ?? combo.key.toUpperCase());
    return parts.join("");
  }
  if (combo.mod) parts.push("Ctrl");
  if (combo.alt) parts.push("Alt");
  if (combo.shift) parts.push("Shift");
  parts.push(KEY_GLYPHS[combo.key] ?? combo.key.toUpperCase());
  return parts.join("+");
}

/**
 * Merge stored bindings over the defaults, dropping anything that doesn't
 * parse or duplicates another action (first-writer wins).
 */
export function mergeBindings(
  stored: Partial<Record<ShortcutAction, string>>,
): Record<ShortcutAction, string> {
  const out: Record<ShortcutAction, string> = { ...DEFAULT_COMBOS };
  const taken = new Set(Object.values(out));
  for (const action of SHORTCUT_ACTIONS) {
    const s = stored[action];
    if (!s || !parseCombo(s)) continue;
    if (taken.has(s)) continue;
    out[action] = s;
    taken.add(s);
  }
  return out;
}

// ---- persistence ----

const KEY = "shortcuts";

export async function loadShortcuts(): Promise<Record<ShortcutAction, string>> {
  let raw = "";
  try {
    raw = inWails()
      ? await StoreService.GetSetting(KEY)
      : localStorage.getItem(KEY) || "";
  } catch {
    /* fall through to defaults */
  }
  let stored: Partial<Record<ShortcutAction, string>> = {};
  try {
    if (raw) stored = JSON.parse(raw);
  } catch {
    stored = {};
  }
  return mergeBindings(stored ?? {});
}

export async function saveShortcuts(map: Record<ShortcutAction, string>) {
  try {
    if (inWails()) await StoreService.SetSetting(KEY, JSON.stringify(map));
    else localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* persistence is best-effort */
  }
}
