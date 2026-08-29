import { describe, expect, it } from "vitest";
import { decodeText, normaliseEol, MAX_TEXT_BYTES } from "./textfile";

const utf8 = (s: string) => new TextEncoder().encode(s);
const bytes = (...b: number[]) => new Uint8Array(b);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};

/** UTF-16 in the given endianness, no BOM added. */
const utf16 = (s: string, little: boolean) => {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i * 2 + (little ? 0 : 1)] = c & 0xff;
    out[i * 2 + (little ? 1 : 0)] = c >> 8;
  }
  return out;
};

describe("normaliseEol", () => {
  it("reports and keeps plain LF", () => {
    const r = normaliseEol("a\nb\nc");
    expect(r.eol).toBe("lf");
    expect(r.text).toBe("a\nb\nc");
  });

  it("converts CRLF and says so", () => {
    const r = normaliseEol("a\r\nb\r\nc");
    expect(r.eol).toBe("crlf");
    expect(r.text).toBe("a\nb\nc");
  });

  it("converts lone CR", () => {
    const r = normaliseEol("a\rb\rc");
    expect(r.eol).toBe("cr");
    expect(r.text).toBe("a\nb\nc");
  });

  it("flags a file that mixes them", () => {
    const r = normaliseEol("a\r\nb\nc");
    expect(r.eol).toBe("mixed");
    expect(r.text).toBe("a\nb\nc");
  });

  it("reports none for a single line", () => {
    expect(normaliseEol("just one line").eol).toBe("none");
    expect(normaliseEol("").eol).toBe("none");
  });

  it("does not count the LF of a CRLF as a separate ending", () => {
    // The naive count sees one CR and one LF and calls the file mixed.
    expect(normaliseEol("a\r\nb").eol).toBe("crlf");
  });
});

describe("decodeText", () => {
  it("reads plain UTF-8", () => {
    const r = decodeText(utf8("hello 世界"));
    expect(r).toMatchObject({ text: "hello 世界", encoding: "utf-8", binary: false });
  });

  it("strips a UTF-8 BOM", () => {
    const r = decodeText(concat(bytes(0xef, 0xbb, 0xbf), utf8("hello")));
    expect(r.text).toBe("hello");
    expect(r.encoding).toBe("utf-8");
  });

  it("reads UTF-16LE by its BOM", () => {
    const r = decodeText(concat(bytes(0xff, 0xfe), utf16("héllo 世界", true)));
    expect(r.text).toBe("héllo 世界");
    expect(r.encoding).toBe("utf-16le");
    expect(r.binary).toBe(false);
  });

  it("reads UTF-16BE by its BOM", () => {
    const r = decodeText(concat(bytes(0xfe, 0xff), utf16("héllo 世界", false)));
    expect(r.text).toBe("héllo 世界");
    expect(r.encoding).toBe("utf-16be");
  });

  it("does not call UTF-16 binary for its zero bytes", () => {
    // Every ASCII character in UTF-16 carries a 0x00 — the NUL sniff has to
    // run after the BOM check or no UTF-16 file is ever readable.
    const r = decodeText(concat(bytes(0xff, 0xfe), utf16("plain ascii", true)));
    expect(r.binary).toBe(false);
    expect(r.text).toBe("plain ascii");
  });

  it("falls back to GB18030 when the bytes are not valid UTF-8", () => {
    // "你好" in GB18030 — invalid as UTF-8, so strict decoding throws.
    const r = decodeText(bytes(0xc4, 0xe3, 0xba, 0xc3));
    expect(r.encoding).toBe("gb18030");
    expect(r.text).toBe("你好");
  });

  it("prefers UTF-8 whenever the bytes are valid UTF-8", () => {
    // GB18030 would happily decode these too, into something else entirely.
    const r = decodeText(utf8("你好"));
    expect(r.encoding).toBe("utf-8");
    expect(r.text).toBe("你好");
  });

  it("refuses a file with a NUL byte", () => {
    const r = decodeText(concat(utf8("PNG"), bytes(0x00, 0x01, 0x02)));
    expect(r.binary).toBe(true);
    expect(r.text).toBe("");
  });

  it("only sniffs the first 8000 bytes for NUL", () => {
    // A NUL past the window is not worth reading a whole file to find, and
    // real text files do not carry one.
    const r = decodeText(concat(utf8("a".repeat(9000)), bytes(0)));
    expect(r.binary).toBe(false);
  });

  it("treats a UTF-32LE BOM as binary rather than mis-decoding it", () => {
    // FF FE 00 00 also starts with the UTF-16LE BOM; taking that branch
    // yields a string of NULs that looks like text and is not.
    const r = decodeText(concat(bytes(0xff, 0xfe, 0x00, 0x00), bytes(0x41, 0, 0, 0)));
    expect(r.binary).toBe(true);
  });

  it("handles an empty file", () => {
    const r = decodeText(new Uint8Array());
    expect(r).toMatchObject({ text: "", binary: false, eol: "none" });
  });

  it("normalises line endings whatever the encoding", () => {
    expect(decodeText(utf8("a\r\nb")).eol).toBe("crlf");
    expect(decodeText(utf8("a\r\nb")).text).toBe("a\nb");
    const u16 = decodeText(concat(bytes(0xff, 0xfe), utf16("a\r\nb", true)));
    expect(u16.eol).toBe("crlf");
    expect(u16.text).toBe("a\nb");
  });

  it("caps at a size a textarea can actually hold", () => {
    expect(MAX_TEXT_BYTES).toBeGreaterThan(1024 * 1024);
    expect(MAX_TEXT_BYTES).toBeLessThanOrEqual(32 * 1024 * 1024);
  });
});
