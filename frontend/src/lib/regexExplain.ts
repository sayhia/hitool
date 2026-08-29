/**
 * Breaks a regex source into labelled tokens so the pattern can be read as a
 * sentence. Deliberately a lexer, not a full parser: it explains what each
 * piece does without trying to model the whole grammar tree.
 */

export interface Token {
  /** The literal source text of this piece. */
  text: string;
  /** Short kind label shown on the chip. */
  kind: string;
  /** Human explanation. */
  desc: string;
}

const CLASS_DESC: Record<string, string> = {
  d: "任意数字 0-9",
  D: "任意非数字",
  w: "单词字符 [A-Za-z0-9_]",
  W: "非单词字符",
  s: "空白字符（空格/制表/换行）",
  S: "非空白字符",
  b: "单词边界",
  B: "非单词边界",
  n: "换行符",
  r: "回车符",
  t: "制表符",
  f: "换页符",
  v: "垂直制表符",
  0: "空字符 NUL",
};

const ANCHOR_DESC: Record<string, string> = {
  "^": "行/串首",
  $: "行/串尾",
};

const QUANT_DESC: Record<string, string> = {
  "*": "重复 0 次或多次",
  "+": "重复 1 次或多次",
  "?": "出现 0 次或 1 次",
};

/** Read a `{m}` / `{m,}` / `{m,n}` quantifier starting at i, or return null. */
function readBrace(src: string, i: number): { text: string; desc: string } | null {
  const m = /^\{(\d+)(,(\d*)?)?\}/.exec(src.slice(i));
  if (!m) return null;
  const [text, min, comma, max] = m;
  if (!comma) return { text, desc: `恰好重复 ${min} 次` };
  if (!max) return { text, desc: `至少重复 ${min} 次` };
  return { text, desc: `重复 ${min} 到 ${max} 次` };
}

/** Read a bracketed character class starting at i (src[i] === "["). */
function readClass(src: string, i: number): string {
  let j = i + 1;
  if (src[j] === "^") j++;
  if (src[j] === "]") j++; // a literal ] may lead the set
  while (j < src.length && src[j] !== "]") {
    if (src[j] === "\\") j++;
    j++;
  }
  return src.slice(i, Math.min(j + 1, src.length));
}

/** Describe a group opener like `(`, `(?:`, `(?<name>`, `(?=`, `(?<=`. */
function describeGroup(src: string, i: number): { text: string; kind: string; desc: string } {
  const rest = src.slice(i);
  const named = /^\(\?<([A-Za-z_$][\w$]*)>/.exec(rest);
  if (named) return { text: named[0], kind: "命名组", desc: `捕获组，命名为 “${named[1]}”` };
  if (rest.startsWith("(?:")) return { text: "(?:", kind: "非捕获", desc: "分组但不捕获" };
  if (rest.startsWith("(?=")) return { text: "(?=", kind: "先行", desc: "后面必须匹配（正向先行）" };
  if (rest.startsWith("(?!")) return { text: "(?!", kind: "先行", desc: "后面不能匹配（负向先行）" };
  if (rest.startsWith("(?<=")) return { text: "(?<=", kind: "后行", desc: "前面必须匹配（正向后行）" };
  if (rest.startsWith("(?<!")) return { text: "(?<!", kind: "后行", desc: "前面不能匹配（负向后行）" };
  return { text: "(", kind: "捕获组", desc: "开始一个捕获组" };
}

export function explain(pattern: string): Token[] {
  const out: Token[] = [];
  let literal = "";

  const flushLiteral = () => {
    if (!literal) return;
    out.push({ text: literal, kind: "字面量", desc: `按字面匹配 “${literal}”` });
    literal = "";
  };

  for (let i = 0; i < pattern.length; ) {
    const c = pattern[i];

    // escape sequences
    if (c === "\\") {
      const n = pattern[i + 1];
      if (n === undefined) {
        literal += c;
        i++;
        continue;
      }
      flushLiteral();
      if (CLASS_DESC[n]) {
        out.push({ text: `\\${n}`, kind: "预定义类", desc: CLASS_DESC[n] });
      } else if (/\d/.test(n)) {
        out.push({ text: `\\${n}`, kind: "反向引用", desc: `重复第 ${n} 个捕获组匹配到的内容` });
      } else if (n === "u" || n === "x") {
        const m = new RegExp(`^\\\\${n}(\\{[0-9a-fA-F]+\\}|[0-9a-fA-F]{${n === "u" ? 4 : 2}})`).exec(
          pattern.slice(i),
        );
        if (m) {
          out.push({ text: m[0], kind: "转义", desc: `Unicode 码位 ${m[1]}` });
          i += m[0].length;
          continue;
        }
        out.push({ text: `\\${n}`, kind: "转义", desc: `转义字符 ${n}` });
      } else if (n === "k") {
        const m = /^\\k<([^>]+)>/.exec(pattern.slice(i));
        if (m) {
          out.push({ text: m[0], kind: "反向引用", desc: `重复命名组 “${m[1]}” 的内容` });
          i += m[0].length;
          continue;
        }
        out.push({ text: "\\k", kind: "转义", desc: "命名反向引用" });
      } else {
        out.push({ text: `\\${n}`, kind: "转义", desc: `匹配字面的 “${n}”` });
      }
      i += 2;
      continue;
    }

    // character class
    if (c === "[") {
      flushLiteral();
      const text = readClass(pattern, i);
      const negated = text.startsWith("[^");
      out.push({
        text,
        kind: "字符集",
        desc: negated ? "匹配集合之外的任一字符" : "匹配集合内的任一字符",
      });
      i += text.length;
      continue;
    }

    // groups
    if (c === "(") {
      flushLiteral();
      const g = describeGroup(pattern, i);
      out.push({ text: g.text, kind: g.kind, desc: g.desc });
      i += g.text.length;
      continue;
    }

    if (c === ")") {
      flushLiteral();
      out.push({ text: ")", kind: "结束", desc: "结束当前分组" });
      i++;
      continue;
    }

    // quantifiers
    if (QUANT_DESC[c]) {
      flushLiteral();
      const lazy = pattern[i + 1] === "?";
      out.push({
        text: lazy ? c + "?" : c,
        kind: "量词",
        desc: QUANT_DESC[c] + (lazy ? "（惰性，尽量少匹配）" : ""),
      });
      i += lazy ? 2 : 1;
      continue;
    }

    if (c === "{") {
      const brace = readBrace(pattern, i);
      if (brace) {
        flushLiteral();
        const lazy = pattern[i + brace.text.length] === "?";
        out.push({
          text: lazy ? brace.text + "?" : brace.text,
          kind: "量词",
          desc: brace.desc + (lazy ? "（惰性）" : ""),
        });
        i += brace.text.length + (lazy ? 1 : 0);
        continue;
      }
      literal += c;
      i++;
      continue;
    }

    // anchors, alternation, dot
    if (ANCHOR_DESC[c]) {
      flushLiteral();
      out.push({ text: c, kind: "锚点", desc: ANCHOR_DESC[c] });
      i++;
      continue;
    }

    if (c === "|") {
      flushLiteral();
      out.push({ text: "|", kind: "或", desc: "左右两侧任选其一" });
      i++;
      continue;
    }

    if (c === ".") {
      flushLiteral();
      out.push({ text: ".", kind: "通配", desc: "任意字符（默认不含换行）" });
      i++;
      continue;
    }

    literal += c;
    i++;
  }

  flushLiteral();
  return out;
}

export const FLAG_DESC: Record<string, string> = {
  g: "全局匹配，找出所有结果",
  i: "忽略大小写",
  m: "多行模式，^ $ 匹配每行首尾",
  s: "dotAll，. 也匹配换行",
  u: "Unicode 模式",
  y: "粘性匹配，从 lastIndex 开始",
};
