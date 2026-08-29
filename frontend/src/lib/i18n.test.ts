import { describe, expect, it } from "vitest";
import { lang, t } from "./i18n";

describe("t", () => {
  it("resolves dotted keys in the active language", () => {
    lang.value = "zh";
    expect(t("common.close")).toBe("关闭");
    lang.value = "en";
    expect(t("common.close")).toBe("Close");
  });

  it("interpolates {param} placeholders", () => {
    lang.value = "zh";
    expect(t("notify.done", { label: "X" })).toBe("X 已完成");
    expect(t("update.available", { v: "0.3.0" })).toContain("0.3.0");
  });

  it("falls back to zh, then to the raw key", () => {
    lang.value = "en";
    expect(t("definitely.not.a.key")).toBe("definitely.not.a.key");
    lang.value = "zh";
  });

  it("returns non-string leaves as the key", () => {
    // "notify" alone points at an object, not a translatable string.
    expect(t("notify")).toBe("notify");
  });
});
