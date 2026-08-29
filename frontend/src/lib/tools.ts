/**
 * Tool registry. Beyond identity, each tool declares which file extensions it
 * accepts — that drives drop routing and the "what can handle this file?"
 * suggestions on the landing screen.
 */
export type CategoryId =
  | "pdf"
  | "image"
  | "text"
  | "dev"
  | "calculator"
  | "creative"
  | "ai";

export interface ToolDef {
  id: string;
  category: CategoryId;
  icon: string;
  /** Extensions without dots. Empty = takes no file input. */
  accept: string[];
}

export const PDF_EXT = ["pdf"];
export const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "bmp", "gif", "tif", "tiff"];

export const CATEGORIES: { id: CategoryId; icon: string }[] = [
  { id: "pdf", icon: "FileText" },
  { id: "image", icon: "Image" },
  { id: "text", icon: "Type" },
  { id: "dev", icon: "Code2" },
  { id: "calculator", icon: "Calculator" },
  { id: "creative", icon: "Wrench" },
  { id: "ai", icon: "Sparkles" },
];

export const TOOLS: ToolDef[] = [
  { id: "pdf-merge", category: "pdf", icon: "Combine", accept: PDF_EXT },
  { id: "pdf-split", category: "pdf", icon: "Scissors", accept: PDF_EXT },
  { id: "pdf-rotate", category: "pdf", icon: "RotateCw", accept: PDF_EXT },
  { id: "pdf-encrypt", category: "pdf", icon: "Lock", accept: PDF_EXT },
  { id: "pdf-compress", category: "pdf", icon: "Minimize2", accept: PDF_EXT },
  { id: "pdf-enhance", category: "pdf", icon: "Sparkle", accept: PDF_EXT },
  { id: "pdf-stamp", category: "pdf", icon: "Stamp", accept: PDF_EXT },
  { id: "pdf-text", category: "pdf", icon: "FileText", accept: PDF_EXT },
  { id: "pdf-meta", category: "pdf", icon: "Info", accept: PDF_EXT },
  { id: "pdf-to-md", category: "pdf", icon: "FileDown", accept: PDF_EXT },
  { id: "pdf-to-image", category: "pdf", icon: "Images", accept: PDF_EXT },
  { id: "image-to-pdf", category: "pdf", icon: "FileImage", accept: IMAGE_EXT },

  { id: "image-convert", category: "image", icon: "RefreshCw", accept: IMAGE_EXT },
  { id: "image-exif", category: "image", icon: "ScanSearch", accept: IMAGE_EXT },
  { id: "image-stitch", category: "image", icon: "Rows3", accept: IMAGE_EXT },
  { id: "image-crop", category: "image", icon: "Crop", accept: IMAGE_EXT },
  { id: "image-bg-remove", category: "image", icon: "Wand2", accept: IMAGE_EXT },
  { id: "image-grid", category: "image", icon: "Grid3x3", accept: IMAGE_EXT },
  { id: "image-compare", category: "image", icon: "Scale", accept: IMAGE_EXT },
  { id: "image-compress", category: "image", icon: "Shrink", accept: IMAGE_EXT },
  { id: "image-diff", category: "image", icon: "Diff", accept: IMAGE_EXT },
  { id: "svg-tool", category: "image", icon: "Spline", accept: ["svg"] },
  { id: "icon-gen", category: "image", icon: "AppWindow", accept: IMAGE_EXT },
  { id: "image-resize", category: "image", icon: "Scaling", accept: IMAGE_EXT },
  { id: "image-watermark", category: "image", icon: "Stamp", accept: IMAGE_EXT },
  { id: "color-extractor", category: "image", icon: "Palette", accept: IMAGE_EXT },

  { id: "text-stats", category: "text", icon: "ChartNoAxesColumn", accept: [] },
  { id: "text-replace", category: "text", icon: "Replace", accept: ["txt", "log", "md"] },
  { id: "typing-test", category: "text", icon: "Keyboard", accept: [] },
  { id: "text-diff", category: "text", icon: "GitCompare", accept: [] },
  { id: "markdown-preview", category: "text", icon: "FileText", accept: ["md", "markdown"] },
  { id: "line-tool", category: "text", icon: "ListOrdered", accept: [] },
  { id: "lorem", category: "text", icon: "TextQuote", accept: [] },
  { id: "slug-tool", category: "text", icon: "Link2", accept: [] },

  // Developer tools — ported from panda-dev-toolkit. Kept in the
  // CATEGORY_GROUPS order below so the rail's sibling list and the
  // launcher's suggestions inherit the same adjacency for free.
  { id: "json-format", category: "dev", icon: "Braces", accept: [] },
  { id: "json-diff", category: "dev", icon: "GitCompare", accept: ["json"] },
  { id: "json-to-code", category: "dev", icon: "Blocks", accept: [] },
  { id: "data-convert", category: "dev", icon: "FileJson", accept: ["json", "yaml", "yml", "toml"] },
  { id: "csv-tool", category: "dev", icon: "Table2", accept: ["csv", "tsv", "json"] },

  { id: "base64-tool", category: "dev", icon: "Binary", accept: [] },
  { id: "url-tool", category: "dev", icon: "Link", accept: [] },
  { id: "jwt-decode", category: "dev", icon: "KeyRound", accept: [] },
  { id: "html-entities", category: "dev", icon: "CodeXml", accept: [] },

  { id: "regex-test", category: "dev", icon: "Regex", accept: [] },
  { id: "xpath-test", category: "dev", icon: "FileCode2", accept: ["html", "htm", "xml", "svg"] },
  { id: "cron-builder", category: "dev", icon: "CalendarClock", accept: [] },
  { id: "curl-parse", category: "dev", icon: "Terminal", accept: [] },
  { id: "http-ref", category: "dev", icon: "Globe", accept: [] },

  { id: "id-gen", category: "dev", icon: "Fingerprint", accept: [] },
  { id: "fake-data", category: "dev", icon: "Users", accept: [] },
  { id: "hash-calc", category: "dev", icon: "Fingerprint", accept: [] },

  { id: "case-convert", category: "dev", icon: "CaseSensitive", accept: [] },
  { id: "sql-format", category: "dev", icon: "Database", accept: ["sql"] },
  { id: "html-preview", category: "dev", icon: "AppWindow", accept: ["html", "htm"] },
  { id: "chmod-calc", category: "dev", icon: "Shield", accept: [] },
  { id: "ip-calc", category: "dev", icon: "Network", accept: [] },

  { id: "bmi-calc", category: "calculator", icon: "HeartPulse", accept: [] },
  { id: "semver-calc", category: "calculator", icon: "GitBranch", accept: [] },
  { id: "timestamp-calc", category: "calculator", icon: "Clock", accept: [] },
  { id: "interest-calc", category: "calculator", icon: "PiggyBank", accept: [] },
  { id: "mortgage-calc", category: "calculator", icon: "House", accept: [] },
  { id: "radix-calc", category: "calculator", icon: "Binary", accept: [] },
  { id: "date-calc", category: "calculator", icon: "CalendarDays", accept: [] },
  { id: "iit-calc", category: "calculator", icon: "Receipt", accept: [] },
  { id: "countdown", category: "calculator", icon: "CalendarHeart", accept: [] },
  { id: "percent-calc", category: "calculator", icon: "Percent", accept: [] },
  { id: "aspect-calc", category: "calculator", icon: "RectangleHorizontal", accept: [] },

  { id: "password-gen", category: "creative", icon: "KeyRound", accept: [] },
  { id: "color-tool", category: "creative", icon: "Palette", accept: [] },
  { id: "unit-convert", category: "creative", icon: "Ruler", accept: [] },
  { id: "qr-code", category: "creative", icon: "QrCode", accept: IMAGE_EXT },
  // Takes anything — renaming does not care what is inside the file.
  { id: "batch-rename", category: "creative", icon: "PenLine", accept: [] },
  { id: "raffle", category: "creative", icon: "Dices", accept: [] },

  { id: "ai-polish", category: "ai", icon: "Wand2", accept: [] },
  { id: "ai-translate", category: "ai", icon: "Languages", accept: [] },
  { id: "ai-table", category: "ai", icon: "Table", accept: [] },
  { id: "ai-summarize", category: "ai", icon: "ListTree", accept: [] },
  { id: "ai-doc", category: "ai", icon: "FileText", accept: [] },
  { id: "ai-explain", category: "ai", icon: "Code2", accept: [] },
];

/**
 * Tools that used to have their own page, now opened as the tool that
 * absorbed them. Old bookmarks, tabs, favorites and history keep working.
 */
export const TOOL_ALIASES: Record<string, { id: string; query?: Record<string, string> }> = {
  "pdf-decrypt": { id: "pdf-encrypt", query: { mode: "decrypt" } },
  "svg-batch": { id: "svg-tool" },
  "color-convert": { id: "color-tool" },
  "pass-strength": { id: "password-gen" },
  "jwt-encode": { id: "jwt-decode", query: { mode: "sign" } },
  "prepay-calc": { id: "mortgage-calc", query: { prepay: "1" } },
  "json-csv": { id: "csv-tool" },
  // The one-shot text formatter folded into the line pipeline — every one of
  // its operations is a step there now.
  "text-format": { id: "line-tool" },
};

export function canonicalToolId(id: string): string {
  return TOOL_ALIASES[id]?.id ?? id;
}

export function aliasQuery(id: string): Record<string, string> {
  return TOOL_ALIASES[id]?.query ?? {};
}

/** Resolve favorites/history ids, collapsing aliases and dropping dupes. */
export function uniqueTools(ids: string[]): ToolDef[] {
  const seen = new Set<string>();
  const out: ToolDef[] = [];
  for (const id of ids) {
    const tool = toolById(id);
    if (!tool || seen.has(tool.id)) continue;
    seen.add(tool.id);
    out.push(tool);
  }
  return out;
}

export function toolsInCategory(cat: CategoryId): ToolDef[] {
  return TOOLS.filter((t) => t.category === cat);
}

/**
 * Categories too large to scan as one wall declare sub-groups; the category
 * page renders a labelled section per entry. `tools` lists ids in display
 * order, and the TOOLS array above must stay in the same order so the rail
 * and the launcher inherit the grouping's adjacency without extra work.
 * Group labels live under `groups.<category>.<id>` in the locales.
 */
export const CATEGORY_GROUPS: Partial<Record<CategoryId, { id: string; tools: string[] }[]>> = {
  dev: [
    { id: "data", tools: ["json-format", "json-diff", "json-to-code", "data-convert", "csv-tool"] },
    { id: "codec", tools: ["base64-tool", "url-tool", "jwt-decode", "html-entities"] },
    { id: "debug", tools: ["regex-test", "xpath-test", "cron-builder", "curl-parse", "http-ref"] },
    { id: "gen", tools: ["id-gen", "fake-data", "hash-calc"] },
    { id: "sys", tools: ["case-convert", "sql-format", "html-preview", "chmod-calc", "ip-calc"] },
  ],
};

/**
 * Category page sections: the declared groups, then any tool the groups
 * missed under a trailing "misc" heading — a tool added to the catalogue
 * but forgotten in the groups must still be reachable on its own page.
 */
export function toolGroupsInCategory(
  cat: CategoryId,
): { key: string; tools: ToolDef[] }[] {
  const declared = CATEGORY_GROUPS[cat];
  if (!declared) return [];
  const all = toolsInCategory(cat);
  const byId = new Map(all.map((t) => [t.id, t]));
  const used = new Set<string>();
  const sections = declared
    .map((g) => {
      const tools = g.tools
        .map((id) => byId.get(id))
        .filter((t): t is ToolDef => !!t);
      for (const t of tools) used.add(t.id);
      return { key: `groups.${cat}.${g.id}`, tools };
    })
    .filter((g) => g.tools.length > 0);
  const rest = all.filter((t) => !used.has(t.id));
  if (rest.length) sections.push({ key: "groups.misc", tools: rest });
  return sections;
}

export function toolById(id: string): ToolDef | undefined {
  const cid = canonicalToolId(id);
  return TOOLS.find((t) => t.id === cid);
}

/** Tools that can act on a given extension — powers drop suggestions. */
export function toolsAccepting(ext: string): ToolDef[] {
  const e = ext.toLowerCase();
  return TOOLS.filter((t) => t.accept.includes(e));
}

/**
 * The tool a route path points at, or "" when the path is not a tool route.
 *
 * Matching on the path rather than on `params.id` matters: `/c/:id` and
 * `/t/:id` both fill `id`, so a component that reads the param alone sees a
 * category page as an unknown *tool*. ToolHost redirects on an unknown tool
 * and stays alive in the KeepAlive cache, so that mistake bounced every
 * category page back to the launcher once any tool had been opened.
 */
export function toolIdOfPath(path: string): string {
  const m = /^\/t\/([a-z0-9-]+)\/?$/.exec(path);
  return m ? m[1] : "";
}
