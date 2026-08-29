/**
 * Turning the bytes of a dropped file into text.
 *
 * The bridge hands over what is on disk, so the webview has to decide what the
 * bytes mean. Guessing badly is worse than refusing: mojibake in a diff pane
 * reads as "every line changed", and a binary file pasted into a text box is
 * just noise. So: honour a BOM, refuse anything that looks binary, and fall
 * back to GB18030 only when the bytes are definitely not UTF-8.
 */

export type TextEncoding = "utf-8" | "utf-16le" | "utf-16be" | "gb18030";

export type Eol = "lf" | "crlf" | "cr" | "mixed" | "none";

export interface DecodedText {
  /** Empty when `binary`. Line endings are normalised to "\n". */
  text: string;
  encoding: TextEncoding;
  binary: boolean;
  /** What the line endings were *before* normalisation. */
  eol: Eol;
}

/** Reading more than this into a textarea helps nobody. */
export const MAX_TEXT_BYTES = 8 * 1024 * 1024;

/** How far in to look for the NUL that gives a binary file away — the same
 *  window git uses, and past it the answer never changes in practice. */
const SNIFF = 8000;

function bom(bytes: Uint8Array): TextEncoding | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }
  // UTF-32LE starts with the UTF-16LE BOM followed by two zero bytes; it is
  // rare enough to leave to the binary check rather than decode wrongly.
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.length >= 4 && bytes[2] === 0 && bytes[3] === 0 ? null : "utf-16le";
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  return null;
}

/** Line endings as they were, plus the text with all of them made "\n". */
export function normaliseEol(text: string): { text: string; eol: Eol } {
  let crlf = 0;
  let cr = 0;
  let lf = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\r") {
      if (text[i + 1] === "\n") {
        crlf++;
        i++;
      } else cr++;
    } else if (c === "\n") lf++;
  }
  const kinds = [crlf, cr, lf].filter((n) => n > 0).length;
  const eol: Eol =
    kinds === 0 ? "none" : kinds > 1 ? "mixed" : crlf ? "crlf" : cr ? "cr" : "lf";
  return { text: eol === "lf" || eol === "none" ? text : text.replace(/\r\n?/g, "\n"), eol };
}

export function decodeText(bytes: Uint8Array): DecodedText {
  const marked = bom(bytes);

  if (marked === "utf-16le" || marked === "utf-16be") {
    // No binary check here — UTF-16 text is half zero bytes by construction,
    // and the BOM already said what these bytes are.
    const raw = new TextDecoder(marked).decode(bytes);
    return { ...normaliseEol(raw), encoding: marked, binary: false };
  }

  for (let i = 0; i < bytes.length && i < SNIFF; i++) {
    if (bytes[i] === 0) return { text: "", encoding: "utf-8", binary: true, eol: "none" };
  }

  // TextDecoder drops a leading UTF-8 BOM on its own, so `marked` needs no
  // special handling beyond having ruled out the UTF-16 cases.
  try {
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ...normaliseEol(raw), encoding: "utf-8", binary: false };
  } catch {
    // Not valid UTF-8. GB18030 maps every byte sequence, so this always
    // produces *something* — and for the legacy Chinese files that actually
    // turn up, it produces the right thing.
    const raw = new TextDecoder("gb18030").decode(bytes);
    return { ...normaliseEol(raw), encoding: "gb18030", binary: false };
  }
}
