import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMBOS,
  comboFromEvent,
  comboText,
  matches,
  mergeBindings,
  parseCombo,
} from "./shortcuts";

function keyEvent(over: Record<string, unknown> = {}): KeyboardEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    key: "a",
    ...over,
  } as unknown as KeyboardEvent;
}

describe("parseCombo", () => {
  it("parses modifiers and key", () => {
    expect(parseCombo("mod+alt+ArrowRight")).toEqual({
      mod: true,
      alt: true,
      shift: false,
      key: "arrowright",
    });
    expect(parseCombo("mod+,")).toEqual({ mod: true, alt: false, shift: false, key: "," });
  });

  it("rejects modifier-only and empty strings", () => {
    expect(parseCombo("mod+alt")).toBeNull();
    expect(parseCombo("")).toBeNull();
  });
});

describe("matches", () => {
  it("requires exact modifiers and case-insensitive key", () => {
    expect(matches(keyEvent({ metaKey: true, key: "K" }), "mod+k")).toBe(true);
    expect(matches(keyEvent({ ctrlKey: true, key: "k" }), "mod+k")).toBe(true);
    expect(matches(keyEvent({ metaKey: true, altKey: true, key: "k" }), "mod+k")).toBe(false);
    expect(matches(keyEvent({ key: "k" }), "mod+k")).toBe(false);
  });

  it("distinguishes arrow directions", () => {
    const e = keyEvent({ metaKey: true, altKey: true, key: "ArrowRight" });
    expect(matches(e, "mod+alt+arrowright")).toBe(true);
    expect(matches(e, "mod+alt+arrowleft")).toBe(false);
  });
});

describe("comboFromEvent", () => {
  it("records mod combos and ignores modifier-only presses", () => {
    expect(comboFromEvent(keyEvent({ metaKey: true, key: "k" }))).toBe("mod+k");
    expect(comboFromEvent(keyEvent({ metaKey: true, shiftKey: true, key: "K" }))).toBe(
      "mod+shift+k",
    );
    expect(comboFromEvent(keyEvent({ key: "Meta" }))).toBeNull();
    expect(comboFromEvent(keyEvent({ key: "Shift" }))).toBeNull();
  });

  it("refuses bare keys — they collide with typing", () => {
    expect(comboFromEvent(keyEvent({ key: "k" }))).toBeNull();
  });

  it("allows alt-only combos", () => {
    expect(comboFromEvent(keyEvent({ altKey: true, key: "p" }))).toBe("alt+p");
  });
});

describe("comboText", () => {
  it("renders arrow glyphs", () => {
    const text = comboText(DEFAULT_COMBOS.cycleNext);
    expect(["⌘⌥→", "Ctrl+Alt+→"]).toContain(text);
  });

  it("falls back to the raw string when unparseable", () => {
    expect(comboText("mod+alt")).toBe("mod+alt");
  });
});

describe("mergeBindings", () => {
  it("keeps defaults when nothing is stored", () => {
    expect(mergeBindings({})).toEqual(DEFAULT_COMBOS);
  });

  it("applies valid overrides and ignores garbage", () => {
    const out = mergeBindings({ palette: "mod+p", closeTab: "nope++", toggleDock: "" });
    expect(out.palette).toBe("mod+p");
    expect(out.closeTab).toBe(DEFAULT_COMBOS.closeTab);
    expect(out.toggleDock).toBe(DEFAULT_COMBOS.toggleDock);
  });

  it("rejects a binding that collides with another action's combo", () => {
    const out = mergeBindings({ toggleDock: "mod+w" }); // taken by closeTab default
    expect(out.toggleDock).toBe(DEFAULT_COMBOS.toggleDock);
  });
});
