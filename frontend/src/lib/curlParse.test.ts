import { describe, expect, it } from "vitest";
import { parseCurl, tokenizeCurl } from "./curlParse";

describe("tokenizeCurl", () => {
  it("respects single and double quotes", () => {
    expect(tokenizeCurl(`curl -H 'a: b c' "x y" z`)).toEqual(["curl", "-H", "a: b c", "x y", "z"]);
  });

  it("joins backslash line continuations", () => {
    expect(tokenizeCurl("curl \\\n  -X POST \\\n  https://x.y")).toEqual(["curl", "-X", "POST", "https://x.y"]);
  });

  it("unescapes inside double quotes only for shell specials", () => {
    expect(tokenizeCurl(`"a\\"b"`)).toEqual(['a"b']);
  });
});

describe("parseCurl", () => {
  it("reads method, url, headers and body", () => {
    const r = parseCurl(
      `curl -X POST https://api.example.com/v1/items -H 'Content-Type: application/json' -H "X-Token: abc" -d '{"a":1}'`,
    );
    expect(r.method).toBe("POST");
    expect(r.url).toBe("https://api.example.com/v1/items");
    expect(r.headers).toEqual([
      { name: "Content-Type", value: "application/json" },
      { name: "X-Token", value: "abc" },
    ]);
    expect(r.body).toBe('{"a":1}');
  });

  it("infers POST when data is present without -X", () => {
    expect(parseCurl("curl https://x.y -d a=1").method).toBe("POST");
    expect(parseCurl("curl https://x.y").method).toBe("GET");
  });

  it("handles glued short flags like -Hvalue and -dvalue", () => {
    const r = parseCurl(`curl -H'A: 1' -d'x=1' https://x.y`);
    expect(r.headers).toEqual([{ name: "A", value: "1" }]);
    expect(r.body).toBe("x=1");
  });

  it("joins multiple -d parts with &", () => {
    expect(parseCurl("curl https://x.y -d a=1 -d b=2").body).toBe("a=1&b=2");
  });

  it("captures user and leaves unknown flags visible", () => {
    const r = parseCurl("curl -u me:pw -k -s https://x.y");
    expect(r.user).toBe("me:pw");
    expect(r.other).toContain("-k");
    expect(r.other).toContain("-s");
  });
});
