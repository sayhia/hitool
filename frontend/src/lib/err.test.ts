import { describe, expect, it } from "vitest";
import { errText } from "./err";

/**
 * This sits on every catch block in the app, so the cases that matter are the
 * degenerate ones — those are what the user actually saw before it existed.
 */
describe("errText", () => {
  it("returns an Error's message without the class-name prefix", () => {
    expect(errText(new Error("pdfcpu: cannot decrypt"))).toBe("pdfcpu: cannot decrypt");
  });

  it("falls back to the class name when the message is empty", () => {
    const e = new Error("");
    e.name = "RuntimeError";
    expect(errText(e)).toBe("RuntimeError");
  });

  it("never surfaces the bare word Error", () => {
    // A plain Error with no message is what a transport failure produces.
    expect(errText(new Error(""))).not.toBe("Error");
    expect(errText(new Error("   "))).not.toBe("Error");
  });

  it("passes a plain string through, trimmed", () => {
    expect(errText("  disk full  ")).toBe("disk full");
  });

  it("digs a message out of a plain rejected object", () => {
    expect(errText({ message: "bad request" })).toBe("bad request");
    expect(errText({ error: "not found" })).toBe("not found");
    expect(errText({ detail: "denied" })).toBe("denied");
  });

  it("never returns [object Object] or an empty string", () => {
    for (const v of [null, undefined, {}, "", "   ", { message: "" }, [], 0]) {
      const out = errText(v);
      expect(out).toBeTruthy();
      expect(out).not.toBe("[object Object]");
    }
  });

  it("keeps a useful non-Error value rather than discarding it", () => {
    expect(errText(404)).toBe("404");
  });
});
