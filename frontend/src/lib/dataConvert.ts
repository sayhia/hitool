/**
 * Data-format conversion between JSON, YAML and TOML.
 *
 * Detection is ordered by strictness: JSON first (it is the only one that
 * insists on braces), then TOML, then YAML — YAML happily swallows both of
 * the others, so asking it first would make everything "YAML".
 */
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { parse as parseToml, stringify as stringifyToml } from "@iarna/toml";

export type DataFormat = "json" | "yaml" | "toml";

export const DATA_FORMATS: DataFormat[] = ["json", "yaml", "toml"];

export function parseAs(text: string, fmt: DataFormat): unknown {
  switch (fmt) {
    case "json":
      return JSON.parse(text);
    case "yaml":
      return parseYaml(text);
    case "toml":
      return parseToml(text);
  }
}

export function stringifyAs(value: unknown, fmt: DataFormat): string {
  switch (fmt) {
    case "json":
      return JSON.stringify(value, null, 2);
    case "yaml":
      return stringifyYaml(value);
    case "toml": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("TOML requires a top-level table");
      }
      return stringifyToml(value as Parameters<typeof stringifyToml>[0]);
    }
  }
}

/** Best guess at what a document is; null when nothing parses. */
export function detectFormat(text: string): DataFormat | null {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      JSON.parse(t);
      return "json";
    } catch {
      /* fall through to the other parsers */
    }
  }
  try {
    parseToml(t);
    return "toml";
  } catch {
    /* not toml */
  }
  try {
    parseYaml(t);
    return "yaml";
  } catch {
    return null;
  }
}
