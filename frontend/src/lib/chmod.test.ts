import { describe, expect, it } from "vitest";
import { emptyMode, fromOctal, toOctal, toFullOctal, toSymbolic, toBinary, toChmodCommand } from "./chmod";

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

  it("handles 4-digit octal with special bits", () => {
    const m = fromOctal("4755")!;
    expect(m.special.setuid).toBe(true);
    expect(m.special.setgid).toBe(false);
    expect(toOctal(m)).toBe("4755");
    expect(toSymbolic(m)).toBe("rwsr-xr-x");
  });

  it("setgid shows as s/S in symbolic", () => {
    const m = fromOctal("2755")!;
    expect(toSymbolic(m)).toBe("rwxr-sr-x");
    const m2 = fromOctal("2745")!;
    expect(toSymbolic(m2)).toBe("rwxr-Sr-x");
  });

  it("sticky bit shows as t/T in symbolic", () => {
    const m = fromOctal("1755")!;
    expect(toSymbolic(m)).toBe("rwxr-xr-t");
    const m2 = fromOctal("1750")!;
    expect(toSymbolic(m2)).toBe("rwxr-x--T");
  });

  it("toFullOctal always returns 4 digits", () => {
    expect(toFullOctal(fromOctal("755")!)).toBe("0755");
    expect(toFullOctal(fromOctal("4755")!)).toBe("4755");
  });

  it("toBinary shows 12-bit representation", () => {
    const m = fromOctal("755")!;
    expect(toBinary(m)).toBe("000 111 101 101");
  });

  it("toChmodCommand generates correct command", () => {
    const m = fromOctal("644")!;
    expect(toChmodCommand(m)).toBe("chmod 644 file");
    expect(toChmodCommand(m, "script.sh")).toBe("chmod 644 script.sh");
  });

  it("round-trips all special bit combos", () => {
    for (const sp of ["1755", "2755", "3755", "4755", "5755", "6755", "7755"]) {
      const m = fromOctal(sp)!;
      expect(toOctal(m)).toBe(sp);
    }
  });
});
