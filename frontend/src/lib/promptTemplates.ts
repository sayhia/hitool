/**
 * Prompt template library: a handful of built-ins plus user-saved prompts.
 * Built-in names/bodies are bilingual and picked by the current language;
 * user templates are plain text the user wrote, so they store as-is.
 */

export interface PromptTemplate {
  id: string;
  name: string;
  body: string;
  builtin?: boolean;
}

interface Bilingual {
  zh: string;
  en: string;
}

/** Generic starters — none of them assume a particular AI tool. */
const BUILTIN: { id: string; name: Bilingual; body: Bilingual }[] = [
  {
    id: "summarize",
    name: { zh: "总结要点", en: "Summarise" },
    body: {
      zh: "请用不超过 5 条要点总结下面的内容，保留关键数字与结论：\n\n",
      en: "Summarise the following in at most 5 bullet points, keeping key figures and conclusions:\n\n",
    },
  },
  {
    id: "translate",
    name: { zh: "中英互译", en: "Translate" },
    body: {
      zh: "把下面的内容翻译成另一种语言（中文译成英文，英文译成中文），只输出译文：\n\n",
      en: "Translate the following into the other language (Chinese to English, English to Chinese). Output only the translation:\n\n",
    },
  },
  {
    id: "keywords",
    name: { zh: "提取关键词", en: "Keywords" },
    body: {
      zh: "从下面的内容中提取 5–10 个关键词，按重要性排序，用逗号分隔：\n\n",
      en: "Extract 5–10 keywords from the following, ordered by importance, comma-separated:\n\n",
    },
  },
  {
    id: "email",
    name: { zh: "改写为邮件", en: "Into email" },
    body: {
      zh: "把下面的内容改写成一封语气专业、结构清晰的邮件，包含称呼与落款：\n\n",
      en: "Rewrite the following as a professional, well-structured email with greeting and sign-off:\n\n",
    },
  },
  {
    id: "outline",
    name: { zh: "扩展大纲", en: "Outline" },
    body: {
      zh: "根据下面的主题写一份层级清晰的大纲，最多三级，便于后续展开成文：\n\n",
      en: "Turn the following topic into a clear outline of at most three levels, ready to be expanded into a draft:\n\n",
    },
  },
  {
    id: "titles",
    name: { zh: "起标题", en: "Titles" },
    body: {
      zh: "为下面的内容起 5 个候选标题，风格各异，附一句说明各自的适用场景：\n\n",
      en: "Suggest 5 candidate titles for the following, varied in tone, with one line on when each fits:\n\n",
    },
  },
  {
    id: "grammar",
    name: { zh: "纠错检查", en: "Proofread" },
    body: {
      zh: "检查下面的内容中的错别字、语法与标点问题，逐条列出并给出修正后的全文：\n\n",
      en: "Proofread the following for typos, grammar and punctuation; list each issue and then output the corrected full text:\n\n",
    },
  },
  {
    id: "explain-code",
    name: { zh: "解释代码", en: "Explain code" },
    body: {
      zh: "请逐段解释下面的代码：它做什么、关键逻辑是什么、有哪些潜在问题：\n\n",
      en: "Explain the following code section by section: what it does, the key logic, and any potential issues:\n\n",
    },
  },
];

export function builtinTemplates(lang: "zh" | "en"): PromptTemplate[] {
  return BUILTIN.map((b) => ({
    id: `b-${b.id}`,
    name: b.name[lang],
    body: b.body[lang],
    builtin: true,
  }));
}

/** A user template needs both a name and a body, and a unique name. */
export function validateTemplate(
  user: PromptTemplate[],
  name: string,
  body: string,
  lang: "zh" | "en",
): string | null {
  const n = name.trim();
  if (!n) return "noName";
  if (!body.trim()) return "noBody";
  if (user.some((t) => t.name === n)) return "dupUser";
  if (builtinTemplates(lang).some((t) => t.name === n)) return "dupBuiltin";
  return null;
}

export function addTemplate(
  user: PromptTemplate[],
  id: string,
  name: string,
  body: string,
): PromptTemplate[] {
  return [...user, { id, name: name.trim(), body }];
}

export function removeTemplate(user: PromptTemplate[], id: string): PromptTemplate[] {
  return user.filter((t) => t.id !== id);
}

/** Built-ins first (stable), then user templates in insertion order. */
export function allTemplates(user: PromptTemplate[], lang: "zh" | "en"): PromptTemplate[] {
  return [...builtinTemplates(lang), ...user];
}

export function normalizeTemplates(raw: unknown): PromptTemplate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t === "object")
    .map((t: Record<string, unknown>) => ({
      id: String(t.id ?? ""),
      name: String(t.name ?? ""),
      body: String(t.body ?? ""),
    }))
    .filter((t) => t.id && t.name && t.body);
}
