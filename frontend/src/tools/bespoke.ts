/**
 * Registry of tools that have a component of their own (everything else is
 * driven by tools/manifest.ts).
 *
 * This lives outside router.ts on purpose: the router lazily imports
 * ToolHost, and ToolHost needs this map. Keeping the map here means the
 * import graph stays one-directional — a cycle here silently yields an
 * undefined loader at setup time and every bespoke tool bounces to the
 * launcher.
 */
import { TOOL_ALIASES } from "../lib/tools";
import { manifestFor } from "./manifest";

const BESPOKE: Record<string, () => Promise<unknown>> = {
  "pdf-enhance": () => import("../views/tools/PdfEnhance.vue"),
  "pdf-stamp": () => import("../views/tools/PdfStamp.vue"),
  "pdf-text": () => import("../views/tools/PdfText.vue"),
  "pdf-meta": () => import("../views/tools/PdfMeta.vue"),
  "pdf-to-md": () => import("../views/tools/PdfToMd.vue"),
  "pdf-to-image": () => import("../views/tools/PdfToImage.vue"),
  "image-exif": () => import("../views/tools/ImageExif.vue"),
  "image-stitch": () => import("../views/tools/ImageStitch.vue"),
  "image-crop": () => import("../views/tools/ImageCrop.vue"),
  "image-bg-remove": () => import("../views/tools/ImageBgRemove.vue"),
  "image-grid": () => import("../views/tools/ImageGrid.vue"),
  "image-compare": () => import("../views/tools/ImageCompare.vue"),
  "color-extractor": () => import("../views/tools/ColorExtractor.vue"),
  "text-stats": () => import("../views/tools/TextStats.vue"),
  "typing-test": () => import("../views/tools/TypingTest.vue"),
  "bmi-calc": () => import("../views/tools/BmiCalc.vue"),
  "semver-calc": () => import("../views/tools/SemverCalc.vue"),
  "timestamp-calc": () => import("../views/tools/TimestampCalc.vue"),
  "interest-calc": () => import("../views/tools/InterestCalc.vue"),
  "mortgage-calc": () => import("../views/tools/MortgageCalc.vue"),
  "password-gen": () => import("../views/tools/PasswordGen.vue"),
  "qr-code": () => import("../views/tools/QrCode.vue"),
  "batch-rename": () => import("../views/tools/BatchRename.vue"),
  "raffle": () => import("../views/tools/RaffleDraw.vue"),
  "image-watermark": () => import("../views/tools/ImageWatermark.vue"),
  "regex-test": () => import("../views/dev/RegexTest.vue"),
  "xpath-test": () => import("../views/dev/XPathTest.vue"),
  "json-diff": () => import("../views/dev/JsonDiff.vue"),
  "id-gen": () => import("../views/dev/IdGen.vue"),
  "fake-data": () => import("../views/dev/FakeData.vue"),
  "color-tool": () => import("../views/tools/ColorTool.vue"),
  "unit-convert": () => import("../views/tools/UnitConvert.vue"),
  "image-diff": () => import("../views/tools/ImageDiff.vue"),
  "http-ref": () => import("../views/dev/HttpRef.vue"),
  "markdown-preview": () => import("../views/text/MarkdownPreview.vue"),
  "text-replace": () => import("../views/text/TextReplace.vue"),
  "line-tool": () => import("../views/text/LineTool.vue"),
  "csv-tool": () => import("../views/dev/CsvTool.vue"),
  "svg-tool": () => import("../views/tools/SvgTool.vue"),
  "json-format": () => import("../views/dev/JsonFormat.vue"),
  "json-to-code": () => import("../views/dev/JsonToCode.vue"),
  "cron-builder": () => import("../views/dev/CronBuilder.vue"),
  "hash-calc": () => import("../views/dev/HashCalc.vue"),
  "base64-tool": () => import("../views/dev/Base64Tool.vue"),
  "url-tool": () => import("../views/dev/UrlTool.vue"),
  "jwt-decode": () => import("../views/dev/JwtDecode.vue"),
  "case-convert": () => import("../views/dev/CaseConvert.vue"),
  "sql-format": () => import("../views/dev/SqlFormat.vue"),
  "data-convert": () => import("../views/dev/DataConvert.vue"),
  "curl-parse": () => import("../views/dev/CurlParse.vue"),
  "text-diff": () => import("../views/text/TextDiff.vue"),
  "radix-calc": () => import("../views/tools/RadixCalc.vue"),
  "date-calc": () => import("../views/tools/DateCalc.vue"),
  "iit-calc": () => import("../views/tools/IitCalc.vue"),
  "countdown": () => import("../views/tools/CountdownDay.vue"),
  "ai-polish": () => import("../views/ai/AiPolish.vue"),
  "ai-translate": () => import("../views/ai/AiTranslate.vue"),
  "ai-table": () => import("../views/ai/AiTable.vue"),
  "ai-summarize": () => import("../views/ai/AiSummarize.vue"),
  "ai-doc": () => import("../views/ai/AiDoc.vue"),
  "ai-explain": () => import("../views/ai/AiExplain.vue"),
  "lorem": () => import("../views/text/LoremIpsum.vue"),
  "slug-tool": () => import("../views/text/SlugTool.vue"),
  "html-entities": () => import("../views/dev/HtmlEntities.vue"),
  "html-preview": () => import("../views/dev/HtmlPreview.vue"),
  "chmod-calc": () => import("../views/dev/ChmodCalc.vue"),
  "ip-calc": () => import("../views/dev/IpCalc.vue"),
  "percent-calc": () => import("../views/tools/PercentCalc.vue"),
  "aspect-calc": () => import("../views/tools/AspectCalc.vue"),
};

/** Resolve a tool id to its component loader, or undefined for manifest tools. */
export function bespokeLoader(id: string) {
  return BESPOKE[id];
}

export function isKnownTool(id: string) {
  return !!BESPOKE[id] || !!manifestFor(id) || !!TOOL_ALIASES[id];
}
