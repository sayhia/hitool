/**
 * Prompt builders for the six AI tools. Shared by the transform bench
 * (polish / translate / table) and the chat bench (summarize / doc / explain).
 */
import { lang } from "./i18n";

export type ChatMsg = { role: string; content: string };

export const TARGETS = [
  { id: "zh", label: "中文" },
  { id: "en", label: "English" },
  { id: "ja", label: "日本語" },
  { id: "ko", label: "한국어" },
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
  { id: "es", label: "Español" },
  { id: "ru", label: "Русский" },
] as const;

const POLISH: Record<string, { zh: string; en: string }> = {
  formal: { zh: "语言正式、书面化，逻辑严谨", en: "formal, written style with rigorous logic" },
  concise: { zh: "语言简洁凝练，删除冗余表达", en: "concise and tight, removing redundancy" },
  vivid: { zh: "语言生动活泼，更有感染力", en: "vivid and engaging" },
};

const DOC: Record<string, { zh: string; en: string }> = {
  summary: {
    zh: "请总结以下文档的核心要点，用条理清晰的列表输出，保留关键数据。",
    en: "Summarize the key points of the document as a clear bullet list, keeping important figures.",
  },
  outline: {
    zh: "请为以下内容生成层级化提纲（Markdown 标题 + 列表）。",
    en: "Generate a hierarchical outline (Markdown headings + lists) for the content.",
  },
  rewrite: {
    zh: "请改写以下文本，使结构更清晰、表达更流畅，保持原意。",
    en: "Rewrite the text with clearer structure and smoother flow, preserving meaning.",
  },
  explain: {
    zh: "请用通俗易懂的语言解释以下内容，适合非专业读者。",
    en: "Explain the content in plain language for a non-expert reader.",
  },
};

const FMT: Record<string, { zh: string; en: string }> = {
  bullets: {
    zh: "用要点列表输出，每条一行，突出关键数字与结论",
    en: "output as a bullet list, one line each, highlighting key figures and conclusions",
  },
  paragraph: {
    zh: "用连贯的段落输出，逻辑通顺，可直接引用",
    en: "output as coherent paragraphs, well-structured and ready to quote",
  },
  outline: {
    zh: "用层级大纲输出（Markdown 标题 + 列表），展现原文结构",
    en: "output as a hierarchical outline (Markdown headings + lists), mirroring the structure of the source",
  },
};

const DEPTH: Record<string, { zh: string; en: string }> = {
  short: { zh: "篇幅精简，控制在 100 字以内", en: "keep it brief, under 100 words" },
  standard: { zh: "篇幅适中，约 200–300 字", en: "moderate length, around 200–300 words" },
  deep: { zh: "详尽完整，重要细节不要省略", en: "thorough and complete, keeping important details" },
};

const FOCUS: Record<string, { zh: string; en: string }> = {
  overview: {
    zh: "先说明这段代码的整体作用与输入输出，再解释关键设计",
    en: "start with what the code does overall — its inputs and outputs — then explain the key design choices",
  },
  step: {
    zh: "逐段（逐行）讲解执行过程，引用相关代码片段并配以说明",
    en: "walk through the execution section by section, quoting the relevant code and explaining each part",
  },
  issues: {
    zh: "重点指出潜在缺陷、边界情况与性能隐患，并给出改进建议",
    en: "focus on potential bugs, edge cases and performance pitfalls, with concrete suggestions to improve them",
  },
};

function loc(): "zh" | "en" {
  return lang.value === "zh" ? "zh" : "en";
}

export function polishMessages(input: string, style: string): ChatMsg[] {
  const zh = loc() === "zh";
  const styleDesc = POLISH[style]?.[loc()] ?? POLISH.formal[loc()];
  const system = zh
    ? `你是一名资深中文编辑。请润色用户提供的文本：${styleDesc}。保持原意与原有格式（段落、列表、Markdown），不要添加解释，直接输出润色后的文本。`
    : `You are a senior editor. Polish the user's text: ${styleDesc}. Preserve the meaning and original formatting (paragraphs, lists, Markdown). Output only the polished text, no explanations.`;
  return [
    { role: "system", content: system },
    { role: "user", content: input },
  ];
}

export function translateMessages(input: string, targetId: string): ChatMsg[] {
  const label = TARGETS.find((x) => x.id === targetId)?.label ?? targetId;
  const system = `You are a professional translator. Detect the source language and translate the user's text into ${label}. Preserve formatting (line breaks, lists, Markdown, code blocks stay untranslated). Output only the translation.`;
  return [
    { role: "system", content: system },
    { role: "user", content: input },
  ];
}

export function tableMessages(input: string, instruction: string): ChatMsg[] {
  const zh = loc() === "zh";
  const system = zh
    ? "你是一名表格数据处理助手。用户会提供表格数据（CSV/TSV/Markdown）和一条处理指令。请执行指令并只输出处理后的 Markdown 表格，不要输出其他解释。"
    : "You are a table-data assistant. The user provides table data (CSV/TSV/Markdown) and an instruction. Apply the instruction and output ONLY the resulting Markdown table, no explanations.";
  const instr = instruction.trim() || (zh ? "整理为规范的 Markdown 表格" : "Normalize into a clean Markdown table");
  return [
    { role: "system", content: system },
    { role: "user", content: `${zh ? "指令" : "Instruction"}: ${instr}\n\n${zh ? "数据" : "Data"}:\n${input}` },
  ];
}

export function docMessages(input: string, mode: string): ChatMsg[] {
  const zh = loc() === "zh";
  const system = zh ? "你是一名专业文档助手，输出使用 Markdown。" : "You are a professional document assistant. Answer in Markdown.";
  const ask = DOC[mode]?.[loc()] ?? DOC.summary[loc()];
  return [
    { role: "system", content: system },
    { role: "user", content: `${ask}\n\n---\n\n${input}` },
  ];
}

export function summarizeMessages(input: string, format: string, depth: string): ChatMsg[] {
  const zh = loc() === "zh";
  const f = FMT[format]?.[loc()] ?? FMT.bullets[loc()];
  const d = DEPTH[depth]?.[loc()] ?? DEPTH.standard[loc()];
  const system = zh
    ? `你是一名资深编辑，擅长提炼长文。请总结用户提供的文本：${f}；${d}。忠于原文，不添加原文没有的信息，不要输出解释或前言，直接给出总结。`
    : `You are a senior editor skilled at distilling long texts. Summarise the user's text: ${f}; ${d}. Stay faithful to the source, never invent details, and output only the summary without preamble.`;
  return [
    { role: "system", content: system },
    { role: "user", content: input },
  ];
}

export function explainMessages(input: string, focus: string): ChatMsg[] {
  const zh = loc() === "zh";
  const f = FOCUS[focus]?.[loc()] ?? FOCUS.overview[loc()];
  const system = zh
    ? `你是一名耐心细致的资深工程师。请解释用户提供的代码：${f}。先判断代码所用语言；用 Markdown 输出，术语准确，面向想真正读懂代码的人，不要泛泛而谈。`
    : `You are a patient, meticulous senior engineer. Explain the user's code: ${f}. Identify the language first; answer in Markdown with precise terminology, written for someone who genuinely wants to understand the code — no filler.`;
  return [
    { role: "system", content: system },
    { role: "user", content: input },
  ];
}
