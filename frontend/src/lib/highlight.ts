/**
 * Minimal syntax highlighter for the generated code panes. Emits token spans
 * rather than HTML strings so the caller can render them without v-html.
 */

export interface CodeToken {
  text: string;
  cls: "" | "kw" | "type" | "str" | "num" | "com" | "attr" | "punc";
}

const KEYWORDS: Record<string, string[]> = {
  go: ["type", "struct", "interface", "any", "package", "import"],
  ts: ["export", "interface", "type", "string", "number", "boolean", "unknown", "null"],
  java: ["package", "import", "public", "class", "private", "static", "final"],
  csharp: ["using", "namespace", "public", "class", "get", "set", "int", "double", "bool", "string", "object"],
  rust: ["use", "pub", "struct", "derive", "impl", "String", "Vec", "Option", "i64", "f64", "bool"],
};

const TYPES: Record<string, RegExp> = {
  go: /^(string|int|int64|float64|bool|any|byte|rune)$/,
  ts: /^(string|number|boolean|unknown|any|null)$/,
  java: /^(String|Integer|Double|Boolean|Object|List)$/,
  csharp: /^(string|int|double|bool|object|List)$/,
  rust: /^(String|i64|f64|bool|Vec|Option|serde_json)$/,
};

/**
 * Tokenises by scanning character-by-character: strings and comments win over
 * everything, then identifiers get classified as keyword / type / plain.
 */
export function highlight(code: string, lang: string): CodeToken[] {
  const kws = new Set(KEYWORDS[lang] ?? []);
  const typeRe = TYPES[lang];
  const out: CodeToken[] = [];
  let buf = "";

  const flush = () => {
    if (!buf) return;
    out.push({ text: buf, cls: "" });
    buf = "";
  };

  const push = (text: string, cls: CodeToken["cls"]) => {
    flush();
    out.push({ text, cls });
  };

  for (let i = 0; i < code.length; ) {
    const c = code[i];

    // line comment
    if (c === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? code.length : end;
      push(code.slice(i, stop), "com");
      i = stop;
      continue;
    }

    // strings and Go struct tags (backtick)
    if (c === '"' || c === "`") {
      let j = i + 1;
      while (j < code.length && code[j] !== c) {
        if (code[j] === "\\") j++;
        j++;
      }
      push(code.slice(i, Math.min(j + 1, code.length)), c === "`" ? "attr" : "str");
      i = j + 1;
      continue;
    }

    // attribute / annotation lines: #[...], @Json..., [JsonPropertyName...]
    if (c === "#" && code[i + 1] === "[") {
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? code.length : end;
      push(code.slice(i, stop), "attr");
      i = stop;
      continue;
    }
    if (c === "@" && /[A-Za-z]/.test(code[i + 1] ?? "")) {
      const m = /^@\w+/.exec(code.slice(i))!;
      push(m[0], "attr");
      i += m[0].length;
      continue;
    }
    if (c === "[" && /^\[[A-Z]\w*\(/.test(code.slice(i))) {
      const end = code.indexOf("]", i);
      const stop = end === -1 ? code.length : end + 1;
      push(code.slice(i, stop), "attr");
      i = stop;
      continue;
    }

    // numbers
    if (/\d/.test(c) && !/[\w]/.test(code[i - 1] ?? "")) {
      const m = /^\d+(?:\.\d+)?/.exec(code.slice(i))!;
      push(m[0], "num");
      i += m[0].length;
      continue;
    }

    // identifiers
    if (/[A-Za-z_]/.test(c)) {
      const m = /^\w+/.exec(code.slice(i))!;
      const word = m[0];
      if (kws.has(word)) push(word, "kw");
      else if (typeRe?.test(word)) push(word, "type");
      else buf += word;
      i += word.length;
      continue;
    }

    buf += c;
    i++;
  }

  flush();
  return out;
}

export const EXTENSIONS: Record<string, string> = {
  go: ".go",
  ts: ".ts",
  java: ".java",
  csharp: ".cs",
  rust: ".rs",
};
