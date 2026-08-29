/**
 * Thin helpers over the generated Wails bindings so components stay terse,
 * plus browser-dev fallbacks (running `vite dev` outside the Wails runtime).
 */
import { Events } from "@wailsio/runtime";
import * as SystemService from "@bindings/hitool/services/systemservice";
import type { AIStreamChunk, ConvertProgress } from "@bindings/hitool/services/models";

export function inWails(): boolean {
  return typeof (window as any)._wails !== "undefined";
}

/** Native multi-file picker; returns [] when cancelled. */
export async function pickFiles(
  title: string,
  filterName: string,
  patterns: string[],
  multiple = true,
): Promise<string[]> {
  if (!inWails()) return [];
  try {
    const res = await SystemService.SelectFiles(title, filterName, patterns, multiple);
    return res ?? [];
  } catch (e) {
    // Cancelled dialogs may reject on some platforms — treat as empty.
    console.warn("pickFiles:", e);
    return [];
  }
}

export async function pickDirectory(title: string): Promise<string> {
  if (!inWails()) return "";
  try {
    return (await SystemService.SelectDirectory(title)) ?? "";
  } catch {
    return "";
  }
}

/** ~/Documents/HiTool/<sub>, created on demand. */
export async function outputDir(sub: string): Promise<string> {
  return await SystemService.DefaultOutputDir(sub);
}

export async function openFolder(path: string) {
  if (path) await SystemService.OpenPath(path);
}

export async function revealFile(path: string) {
  if (path) await SystemService.RevealInFolder(path);
}

/**
 * Event payload shapes come from the generated bindings rather than being
 * restated here — a hand-written copy drifts the moment a Go struct changes,
 * and the compiler cannot tell you it has.
 */
export type ProgressEvt = ConvertProgress;
export type AIChunkEvt = AIStreamChunk;

/** Subscribe to backend batch progress; returns the unsubscribe function. */
export function onConvertProgress(handler: (p: ProgressEvt) => void): () => void {
  return Events.On("convert-progress", (ev) => {
    const d = Array.isArray(ev.data) ? ev.data[0] : ev.data;
    if (d) handler(d);
  });
}

export function onAIStream(handler: (c: AIChunkEvt) => void): () => void {
  return Events.On("ai-stream", (ev) => {
    const d = Array.isArray(ev.data) ? ev.data[0] : ev.data;
    if (d) handler(d);
  });
}

/** Read a file through the backend and wrap it in a Blob URL for previews. */
export async function fileToBlobURL(path: string, mime = "application/octet-stream"): Promise<string> {
  const bytes = await readFileBytes(path);
  return URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: mime }));
}

/** Read a file through the backend as raw bytes ([]byte crosses as base64). */
export async function readFileBytes(path: string): Promise<Uint8Array> {
  const data = await SystemService.ReadFileBytes(path);
  return base64ToBytes(data ?? "");
}

/** Write bytes through the backend in 4MB chunks (avoids giant JSON frames). */
export async function writeFileChunked(path: string, bytes: Uint8Array): Promise<void> {
  const CHUNK = 4 * 1024 * 1024;
  if (bytes.length === 0) {
    await SystemService.WriteFileBytes(path, "");
    return;
  }
  for (let off = 0; off < bytes.length; off += CHUNK) {
    const slice = bytes.subarray(off, Math.min(off + CHUNK, bytes.length));
    await SystemService.WriteFileChunk(path, off, bytesToBase64(slice));
  }
}

export function base64ToBytes(b64: string): Uint8Array {
  if (!b64) return new Uint8Array();
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function formatBytes(n: number): string {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
