import { describe, expect, it } from "vitest";
import { decodeHtml, encodeHtml } from "./htmlEntities";

describe("html entities", () => {
  it("encodes the five markup characters", () => {
    expect(encodeHtml(`<&"' >`)).toBe("&lt;&amp;&quot;&apos; &gt;");
  });

  it("round-trips named and numeric forms", () => {
    const src = `A < B & C "x" ©`;
    expect(decodeHtml(encodeHtml(src))).toBe(src);
    expect(decodeHtml(encodeHtml(src, true))).toBe(src);
  });

  it("decodes hex numeric references", () => {
    expect(decodeHtml("&#x4e2d;")).toBe("中");
  });
});
