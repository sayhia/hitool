import { describe, expect, it } from "vitest";
import { sanitizeFilename, slugify } from "./slugify";

describe("slugify", () => {
  it("collapses punctuation and lowercases", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("keeps CJK", () => {
    expect(slugify("你好 世界")).toBe("你好-世界");
  });

  it("honours separator and max length", () => {
    expect(slugify("a b c", { sep: "_" })).toBe("a_b_c");
    expect(slugify("abcdefghij", { max: 5 })).toBe("abcde");
  });
});

describe("sanitizeFilename", () => {
  it("replaces illegal characters", () => {
    expect(sanitizeFilename("a/b:c*.txt")).toBe("a_b_c_.txt");
  });
});
