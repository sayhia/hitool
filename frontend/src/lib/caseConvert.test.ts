import { describe, expect, it } from "vitest";
import { convertAll, splitWords } from "./caseConvert";

describe("splitWords", () => {
  it("splits camelCase and PascalCase", () => {
    expect(splitWords("userId")).toEqual(["user", "id"]);
    expect(splitWords("HTTPServer")).toEqual(["http", "server"]);
    expect(splitWords("parseHTMLDoc")).toEqual(["parse", "html", "doc"]);
  });

  it("splits snake, kebab, dot, and spaced input", () => {
    expect(splitWords("user_id_v2")).toEqual(["user", "id", "v", "2"]);
    expect(splitWords("user-id")).toEqual(["user", "id"]);
    expect(splitWords("a.b c")).toEqual(["a", "b", "c"]);
  });

  it("keeps CJK runs whole", () => {
    expect(splitWords("用户Id")).toEqual(["用户", "id"]);
    expect(splitWords("user_name_中文")).toEqual(["user", "name", "中文"]);
  });

  it("returns nothing for empty or symbol-only input", () => {
    expect(splitWords("")).toEqual([]);
    expect(splitWords("___")).toEqual([]);
  });
});

describe("convertAll", () => {
  it("renders every style from one input", () => {
    const rows = convertAll("userId");
    const byId = Object.fromEntries(rows.map((r) => [r.style.id, r.text]));
    expect(byId.camel).toBe("userId");
    expect(byId.pascal).toBe("UserId");
    expect(byId.snake).toBe("user_id");
    expect(byId.kebab).toBe("user-id");
    expect(byId.constant).toBe("USER_ID");
    expect(byId.dot).toBe("user.id");
    expect(byId.path).toBe("user/id");
    expect(byId.space).toBe("user id");
    expect(byId.title).toBe("User Id");
  });

  it("leaves CJK words untouched in casing styles", () => {
    const rows = convertAll("用户Id");
    const byId = Object.fromEntries(rows.map((r) => [r.style.id, r.text]));
    expect(byId.snake).toBe("用户_id");
    expect(byId.pascal).toBe("用户Id");
  });

  it("yields nothing for empty input", () => {
    expect(convertAll("")).toEqual([]);
  });
});
