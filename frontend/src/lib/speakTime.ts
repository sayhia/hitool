/**
 * Rough reading / speaking time for pasted text.
 *
 * CJK scripts have no word separators, so they are counted by character and
 * timed against per-character rates; Latin text is counted by word. The rates
 * are the ones commonly quoted for adults reading silently (≈400 CJK chars or
 * 230 words per minute) and reading aloud (≈240 CJK chars or 150 words).
 * They are estimates, and the UI says so.
 */

export interface SpeakEstimate {
  /** Silent reading, minutes. */
  readMinutes: number;
  /** Reading aloud / speaking, minutes. */
  speakMinutes: number;
}

const READ_CJK_PER_MIN = 400;
const READ_WORDS_PER_MIN = 230;
const SPEAK_CJK_PER_MIN = 240;
const SPEAK_WORDS_PER_MIN = 150;

const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/g;
const WORD_RE = /[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g;

export function speakTime(text: string): SpeakEstimate {
  if (!text.trim()) return { readMinutes: 0, speakMinutes: 0 };
  const cjk = (text.match(CJK_RE) || []).length;
  const words = (text.match(WORD_RE) || []).length;
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    readMinutes: round(cjk / READ_CJK_PER_MIN + words / READ_WORDS_PER_MIN),
    speakMinutes: round(cjk / SPEAK_CJK_PER_MIN + words / SPEAK_WORDS_PER_MIN),
  };
}
