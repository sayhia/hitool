/**
 * JSON → typed structures for five languages.
 * Ported from panda-dev-toolkit's jsonToStruct.ts; the parser is unchanged in
 * spirit (walk the sample, name nested objects, emit in dependency order) with
 * nullable detection added so `null` no longer silently becomes `any`.
 */

type IRType = "string" | "int" | "float" | "bool" | "any" | "struct";

interface IRField {
  /** Original JSON key, used for the serialisation tag. */
  key: string;
  name: string;
  type: IRType;
  isList: boolean;
  structRef?: string;
  nullable: boolean;
}

interface IRStruct {
  name: string;
  fields: IRField[];
}

export type Lang = "go" | "ts" | "java" | "csharp" | "rust";

const toCamel = (s: string) => s.replace(/[_-]([a-zA-Z0-9])/g, (_, c) => c.toUpperCase());

const toPascal = (s: string) => {
  const c = toCamel(s);
  if (!c) return "";
  return c.charAt(0).toUpperCase() + c.slice(1);
};

const toSnake = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/^_/, "")
    .toLowerCase();

/** Strip anything that can't appear in an identifier. */
const safeIdent = (s: string, fallback: string) => {
  const cleaned = s.replace(/[^A-Za-z0-9_]/g, "");
  if (!cleaned || /^[0-9]/.test(cleaned)) return fallback;
  return cleaned;
};

class Parser {
  private structs: IRStruct[] = [];
  private names = new Set<string>();

  parse(value: unknown, rootName: string): IRStruct[] {
    this.structs = [];
    this.names = new Set();

    // A root-level array gets the same union treatment as a nested one:
    // taking only the first element would silently drop fields that appear
    // later in the list.
    const root = Array.isArray(value) ? mergeSamples(value) : value;
    if (root && typeof root === "object") {
      this.parseObject(root as Record<string, unknown>, rootName);
    } else {
      this.parseObject({}, rootName);
    }
    return this.structs;
  }

  private unique(base: string): string {
    let name = base;
    let i = 1;
    while (this.names.has(name)) name = `${base}${i++}`;
    this.names.add(name);
    return name;
  }

  private parseObject(obj: Record<string, unknown>, suggested: string): string {
    const structName = this.unique(safeIdent(toPascal(suggested), "Object"));
    const fields: IRField[] = [];

    for (const key of Object.keys(obj)) {
      const val = obj[key];
      const name = safeIdent(toPascal(key), "Field");
      let type: IRType = "any";
      let isList = false;
      let structRef: string | undefined;
      let nullable = false;

      if (val === null) {
        type = "any";
        nullable = true;
      } else if (typeof val === "string") {
        type = "string";
      } else if (typeof val === "number") {
        type = Number.isInteger(val) ? "int" : "float";
      } else if (typeof val === "boolean") {
        type = "bool";
      } else if (Array.isArray(val)) {
        isList = true;
        const first = firstDefined(val);
        if (first === undefined) {
          type = "any";
        } else if (first !== null && typeof first === "object") {
          // Merge every element so fields missing from the first item survive.
          structRef = this.parseObject(mergeSamples(val), toPascal(key) || "Item");
          type = "struct";
        } else if (typeof first === "string") {
          type = "string";
        } else if (typeof first === "number") {
          type = val.every((n) => typeof n === "number" && Number.isInteger(n)) ? "int" : "float";
        } else if (typeof first === "boolean") {
          type = "bool";
        }
      } else if (typeof val === "object") {
        structRef = this.parseObject(val as Record<string, unknown>, toPascal(key) || "Nested");
        type = "struct";
      }

      fields.push({ key, name, type, isList, structRef, nullable });
    }

    this.structs.push({ name: structName, fields });
    return structName;
  }
}

function firstDefined(arr: unknown[]): unknown {
  return arr.find((x) => x !== undefined);
}

/** Union of all object elements, so optional keys still get a field. */
function mergeSamples(arr: unknown[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      // Prefer a non-null sample so the type can be inferred.
      if (!(k in merged) || merged[k] === null) merged[k] = v;
    }
  }
  return merged;
}

// ---------------- generators ----------------
// Discovery pushes children before their parent, so iterating backwards puts
// the root type first — the one you came for is at the top, and nested types
// follow. Declaration order is not significant in any of the target languages.

function genGo(structs: IRStruct[]): string {
  let out = "";
  for (let i = structs.length - 1; i >= 0; i--) {
    const s = structs[i];
    // gofmt aligns name and type columns; match that so the output can be
    // pasted straight into a file without reformatting.
    const rows = s.fields.map((f) => {
      let ty =
        f.type === "struct"
          ? f.structRef ?? "any"
          : { string: "string", int: "int", float: "float64", bool: "bool", any: "any" }[f.type];
      if (f.isList) ty = `[]${ty}`;
      else if (f.nullable && f.type !== "any") ty = `*${ty}`;
      return { name: f.name, ty, tag: `\`json:"${f.key}"\`` };
    });
    const nameW = Math.max(0, ...rows.map((r) => r.name.length));
    const tyW = Math.max(0, ...rows.map((r) => r.ty.length));

    out += `type ${s.name} struct {\n`;
    for (const r of rows) {
      out += `\t${r.name.padEnd(nameW)} ${r.ty.padEnd(tyW)} ${r.tag}\n`;
    }
    out += "}\n\n";
  }
  return out.trimEnd() + "\n";
}

function genTs(structs: IRStruct[]): string {
  let out = "";
  for (let i = structs.length - 1; i >= 0; i--) {
    const s = structs[i];
    out += `export interface ${s.name} {\n`;
    for (const f of s.fields) {
      let ty =
        f.type === "struct"
          ? f.structRef ?? "unknown"
          : { string: "string", int: "number", float: "number", bool: "boolean", any: "unknown" }[
              f.type
            ];
      if (f.isList) ty = `${ty}[]`;
      // `unknown` already admits null, so don't widen it further.
      if (f.nullable && ty !== "unknown") ty = `${ty} | null`;
      const key = /^[A-Za-z_$][\w$]*$/.test(f.key) ? f.key : JSON.stringify(f.key);
      out += `  ${key}: ${ty};\n`;
    }
    out += "}\n\n";
  }
  return out.trimEnd() + "\n";
}

function genJava(structs: IRStruct[], pkg: string): string {
  let out = "";
  if (pkg) out += `package ${pkg};\n\n`;
  out += "import com.fasterxml.jackson.annotation.JsonProperty;\nimport java.util.List;\n\n";
  for (let i = structs.length - 1; i >= 0; i--) {
    const s = structs[i];
    out += `public class ${s.name} {\n`;
    for (const f of s.fields) {
      let ty =
        f.type === "struct"
          ? f.structRef ?? "Object"
          : { string: "String", int: "Integer", float: "Double", bool: "Boolean", any: "Object" }[
              f.type
            ];
      if (f.isList) ty = `List<${ty}>`;
      const field = toCamel(f.name.charAt(0).toLowerCase() + f.name.slice(1));
      out += `    @JsonProperty("${f.key}")\n    private ${ty} ${field};\n\n`;
    }
    out += "}\n\n";
  }
  return out.trimEnd() + "\n";
}

function genCSharp(structs: IRStruct[], ns: string): string {
  const namespace = ns || "Generated";
  let out = "using System.Collections.Generic;\nusing System.Text.Json.Serialization;\n\n";
  out += `namespace ${namespace};\n\n`;
  for (let i = structs.length - 1; i >= 0; i--) {
    const s = structs[i];
    out += `public class ${s.name}\n{\n`;
    for (const f of s.fields) {
      let ty =
        f.type === "struct"
          ? f.structRef ?? "object"
          : { string: "string", int: "int", float: "double", bool: "bool", any: "object" }[f.type];
      if (f.isList) ty = `List<${ty}>`;
      else if (f.nullable) ty = `${ty}?`;
      out += `    [JsonPropertyName("${f.key}")]\n    public ${ty} ${f.name} { get; set; }\n\n`;
    }
    out += "}\n\n";
  }
  return out.trimEnd() + "\n";
}

function genRust(structs: IRStruct[]): string {
  let out = "use serde::{Deserialize, Serialize};\n\n";
  for (let i = structs.length - 1; i >= 0; i--) {
    const s = structs[i];
    out += "#[derive(Debug, Clone, Default, Serialize, Deserialize)]\n";
    out += `pub struct ${s.name} {\n`;
    for (const f of s.fields) {
      let ty =
        f.type === "struct"
          ? f.structRef ?? "serde_json::Value"
          : {
              string: "String",
              int: "i64",
              float: "f64",
              bool: "bool",
              any: "serde_json::Value",
            }[f.type];
      if (f.isList) ty = `Vec<${ty}>`;
      else if (f.nullable) ty = `Option<${ty}>`;
      const field = toSnake(f.name);
      if (field !== f.key) out += `    #[serde(rename = "${f.key}")]\n`;
      out += `    pub ${field}: ${ty},\n`;
    }
    out += "}\n\n";
  }
  return out.trimEnd() + "\n";
}

const parser = new Parser();

export function convert(json: string, lang: Lang, rootName: string, pkg: string): string {
  const value = JSON.parse(json);
  const structs = parser.parse(value, rootName || "Root");
  switch (lang) {
    case "go":
      return genGo(structs);
    case "ts":
      return genTs(structs);
    case "java":
      return genJava(structs, pkg);
    case "csharp":
      return genCSharp(structs, pkg);
    case "rust":
      return genRust(structs);
  }
}

export const LANGS: { id: Lang; label: string; needsPkg: boolean }[] = [
  { id: "go", label: "Go", needsPkg: false },
  { id: "ts", label: "TypeScript", needsPkg: false },
  { id: "java", label: "Java", needsPkg: true },
  { id: "csharp", label: "C#", needsPkg: true },
  { id: "rust", label: "Rust", needsPkg: false },
];
