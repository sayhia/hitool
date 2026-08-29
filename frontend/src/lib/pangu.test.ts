import { describe, expect, it } from "vitest";
import { panguSpacing } from "./pangu";

describe("panguSpacing", () => {
  it("inserts a space between CJK and letters in both directions", () => {
    expect(panguSpacing("使用iPhone拍照")).toBe("使用 iPhone 拍照");
    expect(panguSpacing("这是Go语言")).toBe("这是 Go 语言");
  });

  it("inserts a space between CJK and digits", () => {
    expect(panguSpacing("售价99元，共3件")).toBe("售价 99 元，共 3 件");
  });

  it("is idempotent", () => {
    const once = panguSpacing("今天使用React写代码");
    expect(panguSpacing(once)).toBe(once);
    const withCode = panguSpacing("运行`npm install`安装");
    expect(panguSpacing(withCode)).toBe(withCode);
  });

  it("leaves already-spaced and CJK-only text alone", () => {
    expect(panguSpacing("中文与 英文")).toBe("中文与 英文");
    expect(panguSpacing("只有中文，没有拉丁字符。")).toBe("只有中文，没有拉丁字符。");
  });

  it("skips inline code spans", () => {
    expect(panguSpacing("运行`npm install`安装")).toBe("运行 `npm install` 安装");
    expect(panguSpacing("变量`中文abc`不变")).toBe("变量 `中文abc` 不变");
  });

  it("skips fenced code blocks", () => {
    const src = ["说明使用Vue框架", "```", "使用Vue框架", "```", "再用Vite"].join("\n");
    expect(panguSpacing(src)).toBe(
      ["说明使用 Vue 框架", "```", "使用Vue框架", "```", "再用 Vite"].join("\n"),
    );
  });

  it("handles empty input", () => {
    expect(panguSpacing("")).toBe("");
  });
});
