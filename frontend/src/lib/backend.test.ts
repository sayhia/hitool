import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  baseName,
  bytesToBase64,
  formatBytes,
  formatDuration,
} from "./backend";

describe("formatBytes", () => {
  it("picks units and decimal places", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-3)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024 * 5)).toBe("5.0 MB");
    expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe("2.5 GB");
  });
});

describe("formatDuration", () => {
  it("formats mm:ss and h:mm:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(-1)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3661)).toBe("1:01:01");
  });
});

describe("base64 round trip", () => {
  it("survives empty, ascii and multi-chunk payloads", () => {
    expect(base64ToBytes("")).toEqual(new Uint8Array());
    expect(bytesToBase64(new Uint8Array())).toBe("");
    const data = new Uint8Array([0, 1, 2, 250, 255]);
    expect(base64ToBytes(bytesToBase64(data))).toEqual(data);
  });
});

describe("baseName", () => {
  it("handles both path separators", () => {
    expect(baseName("/a/b/c.txt")).toBe("c.txt");
    expect(baseName("C:\\a\\b.txt")).toBe("b.txt");
    expect(baseName("solo")).toBe("solo");
  });
});
