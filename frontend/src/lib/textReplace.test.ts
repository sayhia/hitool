import { describe, expect, it } from "vitest";
import { replaceAll } from "./regexReplace";
import { compileFind, escapeRegExp } from "./textReplace";

const find = (q: string, o: Partial<Parameters<typeof compileFind>[0]> = {}) =>
  compileFind({ query: q, regex: false, caseSensitive: false, wholeWord: false, ...o });

describe("escapeRegExp", () => {
  it("neuters every syntax character", () => {
    expect(escapeRegExp("a.b*c?d(e)f[g]h{i}j$^k|l\\m")).toBe(
      "a\\.b\\*c\\?d\\(e\\)f\\[g\\]h\\{i\\}j\\$\\^k\\|l\\\\m",
    );
  });

  it("leaves plain text and CJK alone", () => {
    expect(escapeRegExp("hello 世界 123")).toBe("hello 世界 123");
  });
});

describe("compileFind", () => {
  it("gives no regex for an empty query", () => {
    const { re, error } = find("");
    expect(re).toBeNull();
    expect(error).toBe("");
  });

  it("treats the query as literal text by default", () => {
    const { re, error } = find("a.b");
    expect(error).toBe("");
    expect("axb a.b".match(re!)).toEqual(["a.b"]);
  });

  it("is case-insensitive unless asked otherwise", () => {
    expect("The the THE".match(find("the").re!)).toHaveLength(3);
    expect("The the THE".match(find("the", { caseSensitive: true }).re!)).toEqual(["the"]);
  });

  it("keeps whole-word matches inside word boundaries", () => {
    expect("cat category catalog cat".match(find("cat", { wholeWord: true }).re!)).toEqual([
      "cat",
      "cat",
    ]);
  });

  it("passes the query through untouched in regex mode", () => {
    const { re } = find("\\d{2}-\\d{2}", { regex: true });
    expect("序号 12-34 与 5-6".match(re!)).toEqual(["12-34"]);
  });

  it("reports the engine's message for an invalid pattern", () => {
    const { re, error } = find("(", { regex: true });
    expect(re).toBeNull();
    expect(error).toContain("(");
  });

  it("anchors match per line, not per document", () => {
    const { re } = find("^第", { regex: true });
    expect("第1行\n第2行".match(re!)).toHaveLength(2);
  });
});

describe("compileFind + replaceAll", () => {
  it("replaces literal occurrences and nothing that merely looks close", () => {
    const { re } = find("a.b");
    expect(replaceAll("axb a.b a.b", re, "-").output).toBe("axb - -");
  });

  it("honours $-references in the replacement", () => {
    const { re } = find("(\\w+)@(\\w+)", { regex: true });
    expect(replaceAll("ada@example", re, "$2:$1").output).toBe("example:ada");
  });

  it("counts every replacement", () => {
    const { re } = find("the", { caseSensitive: false });
    expect(replaceAll("The cat, the dog, the bird", re, "a").count).toBe(3);
  });

  it("deletes matches when the replacement is empty", () => {
    const { re } = find("TODO:?\\s*", { regex: true });
    expect(replaceAll("a TODO: b", re, "").output).toBe("a b");
  });
});
