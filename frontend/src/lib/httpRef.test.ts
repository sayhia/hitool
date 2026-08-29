import { describe, expect, it } from "vitest";
import {
  HEADERS,
  MIMES,
  STATUSES,
  mimeFor,
  searchHeaders,
  searchMimes,
  searchStatuses,
  statusClass,
} from "./httpRef";

/** Stand-in for the localised note lookup the view passes in. */
const notes: Record<string, string> = {
  s401: "未认证：没带凭证或凭证无效",
  s403: "已认证但无权限",
  s404: "找不到",
};
const note = (k: string) => notes[k] ?? "";

describe("statusClass", () => {
  it("buckets by the leading digit", () => {
    expect(statusClass(100)).toBe("1xx");
    expect(statusClass(204)).toBe("2xx");
    expect(statusClass(301)).toBe("3xx");
    expect(statusClass(418)).toBe("4xx");
    expect(statusClass(503)).toBe("5xx");
  });
});

describe("searchStatuses", () => {
  it("returns everything for an empty query", () => {
    expect(searchStatuses("", note)).toBe(STATUSES);
    expect(searchStatuses("   ", note)).toBe(STATUSES);
  });

  it("matches on the code", () => {
    expect(searchStatuses("404", note).map((s) => s.code)).toEqual([404]);
  });

  it("matches a partial code, which is how you browse a family", () => {
    const codes = searchStatuses("50", note).map((s) => s.code);
    expect(codes).toContain(500);
    expect(codes).toContain(503);
  });

  it("matches on the name, ignoring case", () => {
    expect(searchStatuses("not found", note).map((s) => s.code)).toEqual([404]);
    expect(searchStatuses("GATEWAY", note).map((s) => s.code)).toEqual([502, 504]);
  });

  it("matches on the note, which is the question people arrive with", () => {
    // "logged in but not allowed" is 403, and its *name* says none of that.
    expect(searchStatuses("无权限", note).map((s) => s.code)).toEqual([403]);
  });

  it("returns nothing rather than everything when there is no match", () => {
    expect(searchStatuses("zzzz", note)).toEqual([]);
  });
});

describe("searchHeaders", () => {
  it("matches on the header name", () => {
    expect(searchHeaders("etag", note).map((h) => h.name)).toEqual(["ETag"]);
  });

  it("finds the CORS header by its long name", () => {
    expect(searchHeaders("allow-origin", note)).toHaveLength(1);
  });

  it("returns everything for an empty query", () => {
    expect(searchHeaders("", note)).toBe(HEADERS);
  });
});

describe("searchMimes", () => {
  it("matches on the extension with or without the dot", () => {
    expect(searchMimes("png").map((m) => m.mime)).toEqual(["image/png"]);
    expect(searchMimes(".png").map((m) => m.mime)).toEqual(["image/png"]);
  });

  it("matches on the type", () => {
    const audio = searchMimes("audio/");
    expect(audio.length).toBeGreaterThan(3);
    expect(audio.every((m) => m.mime.startsWith("audio/"))).toBe(true);
  });

  it("returns everything for an empty query", () => {
    expect(searchMimes("")).toBe(MIMES);
  });
});

describe("mimeFor", () => {
  it("reads an extension, a bare name or a whole path", () => {
    expect(mimeFor("png")).toBe("image/png");
    expect(mimeFor(".png")).toBe("image/png");
    expect(mimeFor("photo.PNG")).toBe("image/png");
    expect(mimeFor("/a/b/report.pdf")).toBe("application/pdf");
    expect(mimeFor("C:\\docs\\a.zip")).toBe("application/zip");
  });

  it("returns empty for something not listed", () => {
    expect(mimeFor("xyz")).toBe("");
    expect(mimeFor("noextension")).toBe("");
  });

  it("gives javascript the type the spec now prefers", () => {
    // application/javascript is obsolete per RFC 9239.
    expect(mimeFor("app.js")).toBe("text/javascript");
  });
});

describe("the tables themselves", () => {
  it("lists each status code once", () => {
    const codes = STATUSES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("keeps the codes in order", () => {
    const codes = STATUSES.map((s) => s.code);
    expect([...codes].sort((a, b) => a - b)).toEqual(codes);
  });

  it("gives every row a distinct note key", () => {
    const keys = [...STATUSES.map((s) => s.key), ...HEADERS.map((h) => h.key)];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("maps every extension to a plausible type", () => {
    for (const m of MIMES) {
      expect(m.mime, m.ext).toMatch(/^[a-z]+\/[a-z0-9.+-]+$/);
      expect(m.ext, m.ext).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("allows two extensions to share a type but not to disagree", () => {
    // jpg and jpeg are the same thing; the same extension twice would be a bug.
    const exts = MIMES.map((m) => m.ext);
    expect(new Set(exts).size).toBe(exts.length);
  });
});
