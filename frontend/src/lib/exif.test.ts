import { describe, expect, it } from "vitest";
import { gpsToDegrees, readExif } from "./exif";

/** Builds a tiny JPEG whose only content is an EXIF APP1 segment. */
function jpegWithExif(build: (w: ExifWriter) => void): Uint8Array {
  const buf = new Uint8Array(512);
  const w = new ExifWriter(buf);
  build(w);
  return buf.slice(0, w.end());
}

class ExifWriter {
  private at = 0;
  private little = true;
  private tiffStart = 0;
  private app1LenAt = 0;

  constructor(private buf: Uint8Array) {}

  private view() {
    return new DataView(this.buf.buffer);
  }

  bytes(...bs: number[]) {
    for (const b of bs) this.buf[this.at++] = b & 0xff;
  }

  u16(v: number) {
    this.view().setUint16(this.at, v, this.little);
    this.at += 2;
  }

  u16be(v: number) {
    this.view().setUint16(this.at, v, false);
    this.at += 2;
  }

  u32(v: number) {
    this.view().setUint32(this.at, v, this.little);
    this.at += 4;
  }

  text(s: string) {
    for (let i = 0; i < s.length; i++) this.buf[this.at++] = s.charCodeAt(i);
  }

  /** Offsets inside the TIFF block are relative to its start. */
  rel(): number {
    return this.at - this.tiffStart;
  }

  start(little: boolean) {
    this.little = little;
    this.bytes(0xff, 0xd8); // SOI
    this.bytes(0xff, 0xe1); // APP1
    this.app1LenAt = this.at;
    this.at += 2; // length, patched at end
    this.text("Exif");
    this.bytes(0, 0);
    this.tiffStart = this.at;
    this.text(little ? "II" : "MM");
    this.u16(0x002a);
  }

  /** tag + type + count, value written by caller */
  entry(tag: number, type: number, count: number) {
    this.u16(tag);
    this.u16(type);
    this.u32(count);
  }

  finish() {
    this.bytes(0xff, 0xda); // SOS, parser stops here
    this.view().setUint16(this.app1LenAt, this.at - this.app1LenAt - 2 + 2, false);
  }

  end(): number {
    return this.at;
  }
}

describe("readExif", () => {
  it("reads camera make and formats f-number from a little-endian file", () => {
    const bytes = jpegWithExif((w) => {
      w.start(true);
      w.u32(8); // IFD0 offset
      // IFD0: Make + ExifIFD pointer
      w.u16(2);
      w.entry(0x010f, 2, 4);
      w.text("Acme");
      w.entry(0x8769, 4, 1);
      w.u32(w.rel() + 8); // ExifIFD right after next-offset
      w.u32(0); // next IFD
      // ExifIFD: FNumber rational
      w.u16(1);
      w.entry(0x829d, 5, 1);
      const dataAt = w.rel() + 8;
      w.u32(dataAt);
      w.u32(0);
      // data area
      w.u32(28);
      w.u32(10);
      w.finish();
    });
    const exif = readExif(bytes);
    expect(exif["Make"]).toBe("Acme");
    expect(exif["FNumber"]).toBe("f/2.8");
  });

  it("reads DateTimeOriginal from a big-endian file", () => {
    const bytes = jpegWithExif((w) => {
      w.start(false);
      w.u32(8);
      w.u16(2);
      w.entry(0x010f, 2, 4);
      w.text("Sony");
      w.entry(0x8769, 4, 1);
      w.u32(w.rel() + 8);
      w.u32(0);
      w.u16(1);
      w.entry(0x9003, 2, 20);
      const dataAt = w.rel() + 8;
      w.u32(dataAt);
      w.u32(0);
      w.text("2026:08:20 10:00:00");
      w.bytes(0);
      w.finish();
    });
    const exif = readExif(bytes);
    expect(exif["Make"]).toBe("Sony");
    expect(exif["DateTimeOriginal"]).toBe("2026:08:20 10:00:00");
  });

  it("formats exposure time as a fraction", () => {
    const bytes = jpegWithExif((w) => {
      w.start(true);
      w.u32(8);
      w.u16(2);
      w.entry(0x010f, 2, 4);
      w.text("Acme");
      w.entry(0x8769, 4, 1);
      w.u32(w.rel() + 8);
      w.u32(0);
      w.u16(1);
      w.entry(0x829a, 5, 1);
      const dataAt = w.rel() + 8;
      w.u32(dataAt);
      w.u32(0);
      w.u32(1);
      w.u32(125);
      w.finish();
    });
    expect(readExif(bytes)["ExposureTime"]).toBe("1/125s");
  });

  it("returns an empty object when there is no EXIF segment", () => {
    expect(readExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda]))).toEqual({});
  });

  it("returns an empty object for non-JPEG bytes", () => {
    expect(readExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toEqual({});
  });
});

describe("gpsToDegrees", () => {
  it("converts DMS to decimal degrees", () => {
    expect(gpsToDegrees([31, 14, 24], "N")).toBeCloseTo(31.24, 2);
  });

  it("negates south and west", () => {
    expect(gpsToDegrees([31, 14, 24], "S")).toBeCloseTo(-31.24, 2);
  });
});
