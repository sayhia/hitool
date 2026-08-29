import { describe, expect, it } from "vitest";
import { compareSemVer, parseSemVer, satisfies } from "./semver";

describe("parseSemVer", () => {
  it("parses plain versions and a leading v", () => {
    expect(parseSemVer("1.2.3")).toMatchObject({ major: 1, minor: 2, patch: 3 });
    expect(parseSemVer("v1.2.3")).toMatchObject({ major: 1 });
  });

  it("parses pre-release and build parts", () => {
    const v = parseSemVer("1.0.0-alpha.1+build.5")!;
    expect(v.prerelease).toEqual(["alpha", "1"]);
    expect(v.build).toEqual(["build", "5"]);
  });

  it("rejects junk", () => {
    expect(parseSemVer("1.2")).toBeNull();
    expect(parseSemVer("abc")).toBeNull();
  });
});

describe("compareSemVer", () => {
  const cmp = (a: string, b: string) => compareSemVer(parseSemVer(a)!, parseSemVer(b)!);

  it("orders major/minor/patch", () => {
    expect(cmp("1.2.3", "1.2.4")).toBe(-1);
    expect(cmp("2.0.0", "1.9.9")).toBe(1);
    expect(cmp("1.2.3", "1.2.3")).toBe(0);
  });

  it("puts pre-releases before the release", () => {
    expect(cmp("1.0.0-alpha", "1.0.0")).toBe(-1);
    expect(cmp("1.0.0-alpha.2", "1.0.0-alpha.10")).toBe(-1);
    expect(cmp("1.0.0-1", "1.0.0-alpha")).toBe(-1);
  });

  it("ignores build metadata", () => {
    expect(cmp("1.0.0+aaa", "1.0.0+zzz")).toBe(0);
  });
});

describe("satisfies", () => {
  it("handles caret ranges", () => {
    expect(satisfies("1.4.2", "^1.2.0")).toBe(true);
    expect(satisfies("2.0.0", "^1.2.0")).toBe(false);
    expect(satisfies("0.2.9", "^0.2.3")).toBe(true);
    expect(satisfies("0.3.0", "^0.2.3")).toBe(false);
  });

  it("handles tilde ranges", () => {
    expect(satisfies("1.2.9", "~1.2.3")).toBe(true);
    expect(satisfies("1.3.0", "~1.2.3")).toBe(false);
  });

  it("ANDs spaces and ORs pipes", () => {
    expect(satisfies("1.5.0", ">=1.2.0 <2.0.0")).toBe(true);
    expect(satisfies("2.5.0", ">=1.2.0 <2.0.0")).toBe(false);
    expect(satisfies("3.0.0", "^1.0.0 || ^3.0.0")).toBe(true);
  });

  it("glues a separated operator to its version", () => {
    expect(satisfies("1.5.0", ">= 1.2.0")).toBe(true);
  });

  it("returns null for an unparseable version", () => {
    expect(satisfies("nope", "^1.0.0")).toBeNull();
  });
});
