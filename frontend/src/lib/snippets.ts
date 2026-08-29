/**
 * User-saved regex snippets. Persisted as one JSON blob in the SQLite settings
 * table — panda-dev-toolkit kept these in a separate JSON file, but hitool
 * already has a store, so they live alongside every other preference.
 */
import { ref } from "vue";
import * as StoreService from "@bindings/hitool/services/storeservice";
import { inWails } from "./backend";

const KEY = "regex_snippets";

export interface Snippet {
  id: string;
  name: string;
  pattern: string;
  flags: string;
  category: string;
  description: string;
  sampleText: string;
}

export type SnippetInput = Omit<Snippet, "id">;

export const snippets = ref<Snippet[]>([]);

export function emptySnippet(): SnippetInput {
  return { name: "", pattern: "", flags: "g", category: "", description: "", sampleText: "" };
}

/** Older saves predate the category/description/sample fields. */
function normalize(raw: unknown): Snippet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s === "object")
    .map((s: Record<string, unknown>, i) => ({
      id: String(s.id ?? `s${i}`),
      name: String(s.name ?? ""),
      pattern: String(s.pattern ?? ""),
      flags: String(s.flags ?? "g"),
      category: String(s.category ?? ""),
      description: String(s.description ?? ""),
      sampleText: String(s.sampleText ?? ""),
    }))
    .filter((s) => s.pattern);
}

async function readRaw(): Promise<string> {
  if (inWails()) return (await StoreService.GetSetting(KEY)) ?? "";
  return localStorage.getItem(KEY) ?? "";
}

export async function loadSnippets() {
  try {
    const raw = await readRaw();
    snippets.value = raw ? normalize(JSON.parse(raw)) : [];
  } catch {
    snippets.value = [];
  }
}

async function persist() {
  const raw = JSON.stringify(snippets.value);
  try {
    if (inWails()) await StoreService.SetSetting(KEY, raw);
    else localStorage.setItem(KEY, raw);
  } catch {
    /* best-effort */
  }
}

export async function addSnippet(s: SnippetInput) {
  snippets.value = [...snippets.value, { ...s, id: `s${Date.now()}${snippets.value.length}` }];
  await persist();
}

export async function updateSnippet(id: string, s: SnippetInput) {
  snippets.value = snippets.value.map((x) => (x.id === id ? { ...s, id } : x));
  await persist();
}

export async function removeSnippet(id: string) {
  snippets.value = snippets.value.filter((s) => s.id !== id);
  await persist();
}

/** Distinct categories in use, for the filter dropdown. */
export function categoriesOf(list: Snippet[]): string[] {
  return [...new Set(list.map((s) => s.category).filter(Boolean))].sort();
}

/** Built-in patterns, grouped the way panda organised its template picker. */
export interface BuiltinPattern {
  label: string;
  pattern: string;
  flags: string;
  group: string;
}

export const BUILTIN_PATTERNS: BuiltinPattern[] = [
  // 常用
  { group: "common", label: "Email", pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", flags: "g" },
  { group: "common", label: "URL", pattern: "https?://[-\\w@:%._+~#=]{1,256}\\.[\\w()]{1,6}\\b[-\\w()@:%_+.~#?&/=]*", flags: "g" },
  { group: "common", label: "IPv4", pattern: "\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)\\b", flags: "g" },
  { group: "common", label: "UUID", pattern: "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", flags: "gi" },
  // 日期时间
  { group: "datetime", label: "日期", pattern: "\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}", flags: "g" },
  { group: "datetime", label: "时间", pattern: "\\d{1,2}:\\d{2}(?::\\d{2})?", flags: "g" },
  { group: "datetime", label: "ISO 8601", pattern: "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z?", flags: "g" },
  // 中国大陆
  { group: "cn", label: "手机号", pattern: "1[3-9]\\d{9}", flags: "g" },
  { group: "cn", label: "身份证", pattern: "[1-9]\\d{5}(?:18|19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]", flags: "g" },
  { group: "cn", label: "中文", pattern: "[\\u4e00-\\u9fa5]+", flags: "g" },
  { group: "cn", label: "邮政编码", pattern: "\\b[1-9]\\d{5}\\b", flags: "g" },
  // 代码文本
  { group: "code", label: "数字", pattern: "-?\\d+(?:\\.\\d+)?", flags: "g" },
  { group: "code", label: "Hex 颜色", pattern: "#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b", flags: "g" },
  { group: "code", label: "HTML 标签", pattern: "</?[a-zA-Z][^>]*>", flags: "g" },
  { group: "code", label: "行尾空格", pattern: "[ \\t]+$", flags: "gm" },
  { group: "code", label: "空行", pattern: "^\\s*$", flags: "gm" },
];

export const PATTERN_GROUPS = ["common", "datetime", "cn", "code"] as const;

/** Sample text that exercises most of the built-in patterns. */
export const SAMPLE_TEXT = `联系信息:
  邮箱 ada@example.com, bob.dev@test.org
  手机 13800138000 / 15912345678
  网址 https://example.com 和 http://example.org/path?q=1

服务器:
  192.168.1.1, 10.0.0.255, 8.8.8.8
  部署时间 2026-08-02 15:30:00
  版本 v0.3.0  构建号 20260802

其它:
  颜色 #FF5722 #0af
  UUID 3f2504e0-4f89-11d3-9a0c-0305e82c3301
  中文内容测试`;
