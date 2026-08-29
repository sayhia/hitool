/**
 * AI session history: every finished run is remembered as a record, newest
 * first, capped so the settings blob cannot grow unbounded. Pure logic lives
 * here; persistence is a thin layer in the AI benches.
 */

export interface AiChatMsg {
  role: string;
  content: string;
}

export interface AiRecord {
  id: string;
  toolId: string;
  input: string;
  output: string;
  ts: number;
  /** Present on chat-bench runs so a restore can rebuild the thread. */
  messages?: AiChatMsg[];
}

export const MAX_RECORDS = 50;

/** Records are stored in full, but one enormous paste must not bloat the blob. */
export const MAX_FIELD = 20000;

/** One-line preview for list rows; collapses whitespace so it stays tidy. */
export function snippet(text: string, len = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > len ? `${flat.slice(0, len)}…` : flat;
}

/**
 * Prepend a record, trimming to the cap. Input/output are clamped to
 * MAX_FIELD so a single run cannot dominate the whole store.
 */
export function pushRecord(records: AiRecord[], rec: AiRecord, cap = MAX_RECORDS): AiRecord[] {
  const safe: AiRecord = {
    ...rec,
    input: rec.input.slice(0, MAX_FIELD),
    output: rec.output.slice(0, MAX_FIELD),
    messages: rec.messages?.map((m) => ({
      role: String(m.role ?? ""),
      content: String(m.content ?? "").slice(0, MAX_FIELD),
    })),
  };
  return [safe, ...records].slice(0, Math.max(0, cap));
}

export function removeRecord(records: AiRecord[], id: string): AiRecord[] {
  return records.filter((r) => r.id !== id);
}

/** Normalise whatever came back from storage into trustworthy records. */
export function normalizeRecords(raw: unknown): AiRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object")
    .map((r: Record<string, unknown>) => {
      const rawMsgs = Array.isArray(r.messages) ? r.messages : [];
      const messages = rawMsgs
        .filter((m) => m && typeof m === "object")
        .map((m: Record<string, unknown>) => ({
          role: String(m.role ?? ""),
          content: String(m.content ?? ""),
        }))
        .filter((m) => m.role && m.content);
      return {
        id: String(r.id ?? ""),
        toolId: String(r.toolId ?? ""),
        input: String(r.input ?? ""),
        output: String(r.output ?? ""),
        ts: Number(r.ts ?? 0),
        ...(messages.length ? { messages } : {}),
      };
    })
    .filter((r) => r.id && r.toolId)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_RECORDS);
}
