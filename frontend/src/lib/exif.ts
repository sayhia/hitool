/**
 * Minimal JPEG EXIF reader: walks the APP1 segment, follows the TIFF IFDs
 * and pulls out the tags people actually care about (camera, dates, lens
 * numbers, GPS). Deliberately small — enough to show what a photo leaks,
 * not a full TIFF implementation.
 */

export interface ExifData {
  [key: string]: string | number;
}

const TAG_NAMES: Record<number, string> = {
  0x010f: "Make",
  0x0110: "Model",
  0x0112: "Orientation",
  0x0131: "Software",
  0x0132: "DateTime",
  0x829a: "ExposureTime",
  0x829d: "FNumber",
  0x8827: "ISO",
  0x9003: "DateTimeOriginal",
  0x920a: "FocalLength",
  0xa002: "Width",
  0xa003: "Height",
  0xa434: "LensModel",
};

const GPS_TAG_NAMES: Record<number, string> = {
  0x0001: "GPSLatitudeRef",
  0x0002: "GPSLatitude",
  0x0003: "GPSLongitudeRef",
  0x0004: "GPSLongitude",
};

const TYPE_SIZES: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL
};

class Reader {
  constructor(
    private view: DataView,
    readonly tiffStart: number,
    readonly little: boolean,
  ) {}

  u16(off: number): number {
    return this.view.getUint16(this.tiffStart + off, this.little);
  }

  u32(off: number): number {
    return this.view.getUint32(this.tiffStart + off, this.little);
  }

  ascii(off: number, len: number): string {
    let out = "";
    for (let i = 0; i < len; i++) {
      const c = this.view.getUint8(this.tiffStart + off + i);
      if (c === 0) break;
      out += String.fromCharCode(c);
    }
    return out.trim();
  }

  /** Resolves where a tag's payload lives (inline or behind an offset). */
  payload(entry: number, size: number): number {
    return size > 4 ? this.u32(entry + 8) : entry + 8;
  }

  value(entry: number): string | number | number[] | undefined {
    const type = this.u16(entry + 2);
    const count = this.u32(entry + 4);
    const unit = TYPE_SIZES[type];
    if (!unit) return undefined;
    const off = this.payload(entry, unit * count);

    switch (type) {
      case 2:
        return this.ascii(off, count);
      case 3:
        return count === 1 ? this.u16(off) : this.many(off, count, 2, (o) => this.u16(o));
      case 4:
        return count === 1 ? this.u32(off) : this.many(off, count, 4, (o) => this.u32(o));
      case 5:
      case 10:
        return count === 1
          ? this.rational(off)
          : this.many(off, count, 8, (o) => this.rational(o));
      default:
        return undefined;
    }
  }

  private rational(off: number): number {
    const num = this.u32(off);
    const den = this.u32(off + 4);
    return den === 0 ? 0 : num / den;
  }

  private many(off: number, count: number, stride: number, one: (o: number) => number): number[] {
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(one(off + i * stride));
    return out;
  }
}

/** DMS rationals plus a hemisphere letter become a signed decimal degree. */
export function gpsToDegrees(dms: number[], ref: string): number {
  const deg = (dms[0] ?? 0) + (dms[1] ?? 0) / 60 + (dms[2] ?? 0) / 3600;
  return ref === "S" || ref === "W" ? -deg : deg;
}

function readIfd(r: Reader, ifdOff: number, names: Record<number, string>, out: ExifData) {
  let next = 0;
  const count = r.u16(ifdOff);
  for (let i = 0; i < count; i++) {
    const entry = ifdOff + 2 + i * 12;
    const tag = r.u16(entry);
    const name = names[tag];
    if (name) {
      const v = r.value(entry);
      if (v !== undefined && v !== "") out[name] = v as string | number;
    }
    if (tag === 0x8769) next = r.u32(entry + 8); // Exif sub-IFD
  }
  return next;
}

/** Returns {} for non-JPEGs or JPEGs without an EXIF segment. */
export function readExif(bytes: Uint8Array): ExifData {
  const out: ExifData = {};
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return out;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 2;
  while (off + 4 < bytes.length) {
    if (bytes[off] !== 0xff) return out;
    const marker = bytes[off + 1];
    const len = view.getUint16(off + 2);
    if (marker === 0xe1 && exifAt(bytes, off + 4)) {
      const tiffStart = off + 10;
      const order = String.fromCharCode(bytes[tiffStart], bytes[tiffStart + 1]);
      const little = order === "II";
      const r = new Reader(view, tiffStart, little);
      if (r.u16(2) !== 0x002a) return out;

      const exifIfd = readIfd(r, r.u32(4), TAG_NAMES, out);
      if (exifIfd) readIfd(r, exifIfd, TAG_NAMES, out);
      // GPS IFD hangs off IFD0 via tag 0x8825.
      const gpsOff = findGpsOffset(r, r.u32(4));
      if (gpsOff) readGps(r, gpsOff, out);

      formatNice(out);
      return out;
    }
    if (marker === 0xda) return out; // reached image data
    off += 2 + len;
  }
  return out;
}

function exifAt(bytes: Uint8Array, at: number): boolean {
  return (
    bytes[at] === 0x45 && // E
    bytes[at + 1] === 0x78 && // x
    bytes[at + 2] === 0x69 && // i
    bytes[at + 3] === 0x66 && // f
    bytes[at + 4] === 0 &&
    bytes[at + 5] === 0
  );
}

function findGpsOffset(r: Reader, ifdOff: number): number {
  const count = r.u16(ifdOff);
  for (let i = 0; i < count; i++) {
    const entry = ifdOff + 2 + i * 12;
    if (r.u16(entry) === 0x8825) return r.u32(entry + 8);
  }
  return 0;
}

function readGps(r: Reader, gpsOff: number, out: ExifData) {
  const raw: ExifData = {};
  readIfd(r, gpsOff, GPS_TAG_NAMES, raw);
  const lat = raw["GPSLatitude"];
  const lng = raw["GPSLongitude"];
  if (Array.isArray(lat) && typeof raw["GPSLatitudeRef"] === "string") {
    out["GPSLatitude"] = round4(gpsToDegrees(lat, raw["GPSLatitudeRef"]));
  }
  if (Array.isArray(lng) && typeof raw["GPSLongitudeRef"] === "string") {
    out["GPSLongitude"] = round4(gpsToDegrees(lng, raw["GPSLongitudeRef"]));
  }
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Human-friendly spellings for the optical numbers. */
function formatNice(out: ExifData) {
  if (typeof out["FNumber"] === "number") out["FNumber"] = `f/${round4(out["FNumber"])}`;
  if (typeof out["FocalLength"] === "number")
    out["FocalLength"] = `${round4(out["FocalLength"])}mm`;
  if (typeof out["ExposureTime"] === "number") {
    const e = out["ExposureTime"];
    out["ExposureTime"] = e < 1 ? `1/${Math.round(1 / e)}s` : `${round4(e)}s`;
  }
}
