import { describe, expect, it } from "vitest";
import { parseCIDR } from "./ipv4";

describe("ipv4", () => {
  it("parses a /24", () => {
    const c = parseCIDR("192.168.1.10/24")!;
    expect(c.network).toBe("192.168.1.0");
    expect(c.broadcast).toBe("192.168.1.255");
    expect(c.mask).toBe("255.255.255.0");
    expect(c.first).toBe("192.168.1.1");
    expect(c.last).toBe("192.168.1.254");
    expect(c.hosts).toBe(254);
  });

  it("treats /32 as a single address", () => {
    const c = parseCIDR("10.0.0.1")!;
    expect(c.prefix).toBe(32);
    expect(c.hosts).toBe(1);
    expect(c.first).toBe("10.0.0.1");
  });

  it("rejects bad input", () => {
    expect(parseCIDR("1.2.3")).toBeNull();
    expect(parseCIDR("1.2.3.4/33")).toBeNull();
  });
});
