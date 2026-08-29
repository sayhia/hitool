import { describe, expect, it } from "vitest";
import { dominantSize, groupLines, pageToMarkdown, type MdItem } from "./pdfMarkdown";

const it1 = (str: string, size = 10, y = 0): MdItem => ({ str, size, y });

describe("groupLines", () => {
  it("joins items sharing a y into one line", () => {
    const lines = groupLines([it1("Hello", 10, 100), it1("world", 10, 100)]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Hello world");
  });

  it("keeps CJK runs glued without spaces", () => {
    const lines = groupLines([it1("中文", 10, 50), it1("内容", 10, 50)]);
    expect(lines[0].text).toBe("中文内容");
  });

  it("splits lines when y changes", () => {
    const lines = groupLines([it1("a", 10, 100), it1("b", 10, 88)]);
    expect(lines.map((l) => l.text)).toEqual(["a", "b"]);
  });

  it("treats blank items as line breaks", () => {
    const lines = groupLines([it1("a"), it1("   "), it1("b")]);
    expect(lines).toHaveLength(2);
  });

  it("records the largest size on a mixed line", () => {
    const lines = groupLines([it1("big", 16, 10), it1("small", 10, 10)]);
    expect(lines[0].size).toBe(16);
  });
});

describe("dominantSize", () => {
  it("picks the median, ignoring outlier titles", () => {
    const lines = groupLines([
      it1("Title", 24, 3),
      it1("one", 10, 2),
      it1("two", 10, 1),
      it1("three", 10, 0),
    ]);
    expect(dominantSize(lines)).toBe(10);
  });

  it("returns 0 for no lines", () => {
    expect(dominantSize([])).toBe(0);
  });
});

describe("pageToMarkdown", () => {
  it("promotes an oversized line to a heading", () => {
    const lines = groupLines([
      it1("Section One", 14, 90),
      it1("body text here", 10, 80),
      it1("more body text", 10, 70),
      it1("even more body", 10, 60),
    ]);
    const md = pageToMarkdown(lines);
    expect(md).toContain("## Section One");
  });

  it("keeps the depth of explicit # headings", () => {
    const lines = groupLines([
      it1("### Deep", 10, 90),
      it1("body", 10, 80),
      it1("body", 10, 70),
      it1("body", 10, 60),
    ]);
    expect(pageToMarkdown(lines)).toContain("### Deep");
  });

  it("pairs a bullet glyph with the following line", () => {
    const lines = groupLines([
      it1("•", 10, 90),
      it1("apples", 10, 85),
      it1("•", 10, 80),
      it1("pears", 10, 75),
    ]);
    const md = pageToMarkdown(lines);
    expect(md).toContain("- apples");
    expect(md).toContain("- pears");
  });

  it("does not mark long lines as headings", () => {
    const long = "a very long line that keeps going ".repeat(4).trim();
    const lines = groupLines([it1(long, 14, 90), it1("body", 10, 80)]);
    expect(pageToMarkdown(lines)).not.toContain("#");
  });

  it("lets a lone title on the first page become a heading", () => {
    const lines = groupLines([it1("Report 2026", 20, 100), it1("by the team", 10, 90)]);
    expect(pageToMarkdown(lines, { firstPage: true })).toContain("# Report 2026");
  });

  it("collapses triple blank runs", () => {
    const lines = groupLines([
      it1("## Head", 10, 90),
      it1("body", 10, 80),
      it1("body", 10, 70),
      it1("body", 10, 60),
    ]);
    const md = pageToMarkdown(lines);
    expect(md).not.toMatch(/\n{3,}/);
  });
});
