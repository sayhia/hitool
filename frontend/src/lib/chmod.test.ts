import { describe, expect, it } from "vitest";
import { emptyMode, fromOctal, toOctal, toSymbolic } from "./chmod";

describe("chmod", () => {
  it("round-trips 755", () => {
    const m = fromOctal("755")!;
    expect(toOctal(m)).toBe("755");
    expect(toSymbolic(m)).toBe("rwxr-xr-x");
  });

  it("rejects junk", () => {
    expect(fromOctal("999")).toBeNull();
    expect(toOctal(emptyMode())).toBe("000");
  });
});
