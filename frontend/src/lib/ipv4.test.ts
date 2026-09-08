import { describe, expect, it } from "vitest";
import { parseCIDR, ipv4ToBinary, ipClass, isPrivate, parseIPv4 } from "./ipv4";

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

  it("detects IP class", () => {
    expect(ipClass(parseIPv4("10.0.0.1")!)).toBe("A");
    expect(ipClass(parseIPv4("172.16.0.1")!)).toBe("B");
    expect(ipClass(parseIPv4("192.168.1.1")!)).toBe("C");
    expect(ipClass(parseIPv4("224.0.0.1")!)).toBe("D");
    expect(ipClass(parseIPv4("240.0.0.1")!)).toBe("E");
  });

  it("detects private ranges", () => {
    expect(isPrivate(parseIPv4("10.0.0.1")!)).toBe(true);
    expect(isPrivate(parseIPv4("172.16.0.1")!)).toBe(true);
    expect(isPrivate(parseIPv4("172.31.255.255")!)).toBe(true);
    expect(isPrivate(parseIPv4("172.32.0.0")!)).toBe(false);
    expect(isPrivate(parseIPv4("192.168.1.1")!)).toBe(true);
    expect(isPrivate(parseIPv4("8.8.8.8")!)).toBe(false);
  });

  it("converts to binary", () => {
    expect(ipv4ToBinary(parseIPv4("192.168.1.0")!)).toBe("11000000.10101000.00000001.00000000");
    expect(ipv4ToBinary(parseIPv4("255.255.255.0")!)).toBe("11111111.11111111.11111111.00000000");
  });

  it("includes class and private in CIDR result", () => {
    const c = parseCIDR("192.168.1.0/24")!;
    expect(c.class).toBe("C");
    expect(c.private).toBe(true);
    expect(c.ipBin).toContain("11000000");
    expect(c.maskBin).toBe("11111111.11111111.11111111.00000000");
  });
});
