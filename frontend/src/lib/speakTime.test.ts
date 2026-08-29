import { describe, expect, it } from "vitest";
import { speakTime } from "./speakTime";

describe("speakTime", () => {
  it("returns zero for empty or blank text", () => {
    expect(speakTime("")).toEqual({ readMinutes: 0, speakMinutes: 0 });
    expect(speakTime("   \n  ")).toEqual({ readMinutes: 0, speakMinutes: 0 });
  });

  it("times pure CJK text by character rate", () => {
    const text = "中".repeat(400);
    expect(speakTime(text).readMinutes).toBe(1); // 400 chars / 400 per min
    expect(speakTime(text).speakMinutes).toBe(1.7); // 400 / 240
  });

  it("times pure Latin text by word rate", () => {
    const text = Array.from({ length: 230 }, (_, i) => `word${i}`).join(" ");
    expect(speakTime(text).readMinutes).toBe(1); // 230 words / 230 wpm
    expect(speakTime(text).speakMinutes).toBe(1.5); // 230 / 150
  });

  it("mixes both scripts", () => {
    // 200 CJK chars + 115 words = 0.5 + 0.5 minutes of reading.
    const text = "中".repeat(200) + " " + Array.from({ length: 115 }, () => "hi").join(" ");
    expect(speakTime(text).readMinutes).toBe(1);
  });

  it("counts hyphenated words as one", () => {
    expect(speakTime("well-known state-of-the-art").readMinutes).toBe(0);
  });
});
