import { describe, expect, it } from "vitest";
import {
  base64ToUtf8,
  buildQuery,
  decodeJwt,
  formatRadix,
  fromBase64Url,
  isProbablyBase64,
  parseQuery,
  parseRadix,
  safeDecode,
  toBase64Url,
  utf8ToBase64,
} from "./codec";

describe("base64", () => {
  it("round-trips ASCII", () => {
    expect(utf8ToBase64("abc")).toBe("YWJj");
    expect(base64ToUtf8("YWJj")).toBe("abc");
  });

  it("round-trips non-Latin-1 text that btoa alone would reject", () => {
    for (const s of ["中文内容", "emoji 🎉 test", "Ünïcödé", "日本語テキスト"]) {
      expect(base64ToUtf8(utf8ToBase64(s)), s).toBe(s);
    }
    // btoa would throw on this; our encoder must not.
    expect(() => utf8ToBase64("🎉")).not.toThrow();
  });

  it("handles the empty string", () => {
    expect(utf8ToBase64("")).toBe("");
    expect(base64ToUtf8("")).toBe("");
  });

  it("tolerates whitespace in the encoded input", () => {
    expect(base64ToUtf8("YWJj\n")).toBe("abc");
    expect(base64ToUtf8("YW Jj")).toBe("abc");
  });

  it("converts to and from the URL-safe alphabet", () => {
    const b64 = utf8ToBase64("~~~ÿþ");
    const url = toBase64Url(b64);
    expect(url).not.toMatch(/[+/=]/);
    expect(fromBase64Url(url)).toBe(b64);
  });

  it("pads correctly when converting back from base64url", () => {
    expect(fromBase64Url("YQ").length % 4).toBe(0);
    expect(base64ToUtf8(fromBase64Url("YQ"))).toBe("a");
  });

  it("recognises plausible base64", () => {
    expect(isProbablyBase64("YWJj")).toBe(true);
    expect(isProbablyBase64("not base64!")).toBe(false);
    expect(isProbablyBase64("abc")).toBe(false); // length not a multiple of 4
    expect(isProbablyBase64("")).toBe(false);
  });
});

describe("query strings", () => {
  it("splits a full URL into base, params and hash", () => {
    const r = parseQuery("https://x.com/a/b?q=1&lang=zh#top");
    expect(r.base).toBe("https://x.com/a/b");
    expect(r.hash).toBe("top");
    expect(r.params).toEqual([
      { key: "q", value: "1" },
      { key: "lang", value: "zh" },
    ]);
  });

  it("accepts a bare query string", () => {
    expect(parseQuery("a=1&b=2").params).toEqual([
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ]);
  });

  it("keeps a URL with no query", () => {
    const r = parseQuery("https://x.com/a");
    expect(r.base).toBe("https://x.com/a");
    expect(r.params).toEqual([]);
  });

  it("decodes percent escapes and plus-as-space", () => {
    expect(parseQuery("q=%E4%B8%AD%E6%96%87").params[0].value).toBe("中文");
    expect(parseQuery("q=a+b").params[0].value).toBe("a b");
  });

  it("keeps a valueless key", () => {
    expect(parseQuery("flag&x=1").params).toEqual([
      { key: "flag", value: "" },
      { key: "x", value: "1" },
    ]);
  });

  it("does not throw on a malformed escape", () => {
    expect(() => parseQuery("q=%E4%")).not.toThrow();
    expect(parseQuery("q=%E4%").params[0].value).toBe("%E4%");
    expect(safeDecode("%")).toBe("%");
  });

  it("rebuilds an equivalent URL", () => {
    const url = "https://x.com/a?q=%E4%B8%AD&b=1#f";
    const r = parseQuery(url);
    const back = buildQuery(r.base, r.params, r.hash);
    expect(parseQuery(back).params).toEqual(r.params);
    expect(back).toContain("#f");
  });

  it("drops params with an empty key when rebuilding", () => {
    expect(buildQuery("u", [{ key: "", value: "x" }], "")).toBe("u");
  });

  it("handles empty input", () => {
    expect(parseQuery("")).toMatchObject({ base: "", params: [], hash: "" });
  });
});

describe("decodeJwt", () => {
  // header {"alg":"HS256","typ":"JWT"} / payload with exp in 2033
  const TOKEN =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSIsImlhdCI6MTUxNjIzOTAyMiwiZXhwIjoyMDAwMDAwMDAwfQ." +
    "sig";

  it("splits and decodes both halves", () => {
    const r = decodeJwt(TOKEN);
    expect(r.error).toBe("");
    expect(r.header.json).toContain('"alg": "HS256"');
    expect(r.payload.json).toContain('"name": "Ada"');
    expect(r.signature).toBe("sig");
  });

  it("rejects a token without three parts", () => {
    expect(decodeJwt("a.b").error).toContain("three");
    expect(decodeJwt("a.b.c.d").error).toContain("three");
  });

  it("returns an empty shape for empty input", () => {
    const r = decodeJwt("");
    expect(r.error).toBe("");
    expect(r.claims).toEqual([]);
  });

  it("humanises time claims and flags expiry against the given clock", () => {
    const past = decodeJwt(TOKEN, new Date(2100, 0, 1));
    expect(past.claims.find((c) => c.key === "exp")?.expired).toBe(true);

    const present = decodeJwt(TOKEN, new Date(2020, 0, 1));
    expect(present.claims.find((c) => c.key === "exp")?.expired).toBe(false);
    // iat is a time claim too, but never carries an expiry flag.
    expect(present.claims.find((c) => c.key === "iat")?.expired).toBeUndefined();
  });

  it("lists only the registered claims that are present", () => {
    const keys = decodeJwt(TOKEN).claims.map((c) => c.key);
    expect(keys).toContain("sub");
    expect(keys).toContain("iat");
    expect(keys).not.toContain("iss");
  });

  it("reports a part that isn't valid base64 JSON without throwing", () => {
    const r = decodeJwt("###.###.sig");
    expect(() => decodeJwt("###.###.sig")).not.toThrow();
    expect(r.header.error || r.payload.error).toBeTruthy();
  });

  it("survives a payload that is valid JSON but not an object", () => {
    // RFC 7519 says the payload is a JSON object, but this is the tool people
    // reach for *because* a token looks wrong. `"iss" in null` is a TypeError,
    // and it would escape a computed and take the whole view down.
    const b64u = (s: string) =>
      btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    for (const payload of ["null", "42", '"a string"', "[1,2]", "true"]) {
      const tok = `${b64u('{"alg":"none"}')}.${b64u(payload)}.sig`;
      expect(() => decodeJwt(tok), payload).not.toThrow();
      // The part still shows what was in there; there are just no claims.
      const r = decodeJwt(tok);
      expect(r.payload.json, payload).toBeTruthy();
      expect(r.claims, payload).toEqual([]);
    }
  });
});

describe("radix", () => {
  it("parses each supported base", () => {
    expect(parseRadix("1010", 2)).toBe(10n);
    expect(parseRadix("777", 8)).toBe(511n);
    expect(parseRadix("255", 10)).toBe(255n);
    expect(parseRadix("ff", 16)).toBe(255n);
    expect(parseRadix("FF", 16)).toBe(255n);
  });

  it("rejects digits that don't belong to the base", () => {
    expect(parseRadix("2", 2)).toBeNull();
    expect(parseRadix("8", 8)).toBeNull();
    expect(parseRadix("g", 16)).toBeNull();
    expect(parseRadix("", 10)).toBeNull();
    expect(parseRadix("-", 10)).toBeNull();
  });

  it("ignores spacing so grouped output can be pasted back in", () => {
    expect(parseRadix("1111 1111", 2)).toBe(255n);
    expect(parseRadix("DE_AD", 16)).toBe(0xdeadn);
  });

  it("handles negatives and very large values", () => {
    expect(parseRadix("-ff", 16)).toBe(-255n);
    const big = "ffffffffffffffffffff";
    expect(formatRadix(parseRadix(big, 16)!, 16)).toBe(big.toUpperCase());
  });

  it("groups digits from the right", () => {
    expect(formatRadix(255n, 2, 4)).toBe("1111 1111");
    expect(formatRadix(511n, 2, 4)).toBe("1 1111 1111");
    expect(formatRadix(1234567n, 10, 3)).toBe("1 234 567");
    expect(formatRadix(255n, 16, 0)).toBe("FF");
  });

  it("keeps the sign outside the grouping", () => {
    expect(formatRadix(-255n, 2, 4)).toBe("-1111 1111");
  });
});
