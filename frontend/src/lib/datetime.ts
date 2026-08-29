/**
 * Timestamp helpers: unit detection, multi-format rendering, relative time.
 */

const p2 = (n: number) => String(n).padStart(2, "0");
const p3 = (n: number) => String(n).padStart(3, "0");

/**
 * Guess whether a numeric timestamp is in seconds or milliseconds.
 * 10-digit values land in 2001–2286 as seconds; 13-digit values are ms.
 * Anything ≥ 1e11 is treated as ms, which is the boundary used everywhere.
 */
export function detectUnit(n: number): "s" | "ms" {
  return Math.abs(n) >= 1e11 ? "ms" : "s";
}

export function toDate(value: number, unit: "s" | "ms" | "auto"): Date {
  const u = unit === "auto" ? detectUnit(value) : unit;
  return new Date(u === "s" ? value * 1000 : value);
}

export interface Formatted {
  key: string;
  label: string;
  value: string;
}

const WEEK_ZH = ["日", "一", "二", "三", "四", "五", "六"];

/** Every representation of one instant, for copy-paste into any system. */
export function formats(d: Date): Formatted[] {
  const local = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  const slash = local.replace(/-/g, "/");
  const cn = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} 周${WEEK_ZH[d.getDay()]}`;
  const utc = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} UTC`;
  return [
    { key: "iso", label: "ISO 8601", value: d.toISOString() },
    { key: "rfc", label: "RFC 2822", value: d.toUTCString() },
    { key: "local", label: "本地时间 / SQL", value: local },
    { key: "utc", label: "UTC", value: utc },
    { key: "cn", label: "中文格式", value: cn },
    { key: "slash", label: "斜杠格式", value: slash },
    { key: "ms", label: "毫秒时间戳", value: String(d.getTime()) },
    { key: "s", label: "秒级时间戳", value: String(Math.floor(d.getTime() / 1000)) },
    {
      key: "isoLocal",
      label: "ISO（本地时区）",
      value: `${local.replace(" ", "T")}.${p3(d.getMilliseconds())}`,
    },
  ];
}

/** "3 小时前" / "in 2 days" — sign-aware, unit-collapsing. */
export function relative(d: Date, now: Date, lang: "zh" | "en"): string {
  const diff = d.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const units: [number, string, string][] = [
    [1000, "秒", "second"],
    [60 * 1000, "分钟", "minute"],
    [3600 * 1000, "小时", "hour"],
    [86400 * 1000, "天", "day"],
    [30 * 86400 * 1000, "个月", "month"],
    [365 * 86400 * 1000, "年", "year"],
  ];

  let idx = 0;
  for (let i = units.length - 1; i >= 0; i--) {
    if (abs >= units[i][0]) {
      idx = i;
      break;
    }
  }
  const [ms, zh, en] = units[idx];
  const n = Math.max(1, Math.round(abs / ms));

  if (lang === "zh") return diff < 0 ? `${n} ${zh}前` : `${n} ${zh}后`;
  const plural = n === 1 ? en : `${en}s`;
  return diff < 0 ? `${n} ${plural} ago` : `in ${n} ${plural}`;
}

/** Code to obtain the current timestamp in each common language. */
export const SNIPPETS: { label: string; code: string }[] = [
  { label: "JavaScript · 秒", code: "Math.floor(Date.now() / 1000)" },
  { label: "JavaScript · 毫秒", code: "Date.now()" },
  { label: "Go", code: "time.Now().Unix()" },
  { label: "Python", code: "int(time.time())" },
  { label: "Java", code: "System.currentTimeMillis() / 1000" },
  { label: "Rust", code: 'SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs()' },
  { label: "PHP", code: "time()" },
  { label: "Shell", code: "date +%s" },
  { label: "MySQL", code: "SELECT UNIX_TIMESTAMP();" },
  { label: "ISO 8601 → 时间戳", code: 'new Date("2026-08-02T12:00:00Z").getTime()' },
];

/** Example inputs offered as one-click fills. */
export const TS_EXAMPLES: { label: string; value: string }[] = [
  { label: "2026-01-01", value: "1767225600" },
  { label: "毫秒示例", value: "1767225600000" },
  { label: "Unix 元年", value: "0" },
];

export const DATE_EXAMPLES: { label: string; value: string }[] = [
  { label: "ISO", value: "2026-08-02T12:00:00Z" },
  { label: "SQL", value: "2026-08-02 12:00:00" },
  { label: "斜杠", value: "2026/08/02 12:00:00" },
];

/** Accepts ISO, SQL, slash and Chinese-ish forms. Returns null when unusable. */
export function parseLoose(text: string): Date | null {
  const s = text.trim();
  if (!s) return null;
  // Normalise "2026/08/02 12:00" and "2026-08-02 12:00" to something Date accepts
  // across engines (Safari rejects the space form).
  const normalised = s.replace(/\//g, "-").replace(" ", "T");
  const d = new Date(normalised);
  if (!isNaN(d.getTime())) return d;
  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}
