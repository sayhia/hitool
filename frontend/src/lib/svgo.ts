/**
 * SVG clean-up.
 *
 * What comes out of a drawing program is mostly not drawing: editor metadata,
 * a namespace nobody reads, and coordinates carried to fourteen decimal places
 * because that is what a float printed as. Removing those is safe and usually
 * halves the file.
 *
 * The transforms here are string-level and deliberately conservative — each
 * one targets a construct that cannot be confused with content. Anything that
 * would need to understand the document's structure (merging paths, dropping
 * unused defs) is left out rather than done approximately: a "smaller" SVG
 * that renders differently is a bug, not an optimisation.
 */

export interface SvgOptions {
  comments?: boolean;
  /** Remove `<script>` and `on*` handlers. */
  scripts?: boolean;
  metadata?: boolean;
  editorNamespaces?: boolean;
  emptyAttributes?: boolean;
  /** Decimal places to keep in coordinates. -1 leaves numbers alone. */
  precision?: number;
  collapseWhitespace?: boolean;
  /** Drop width/height so the viewBox alone drives the size. */
  responsive?: boolean;
}

export const DEFAULT_OPTIONS: Required<SvgOptions> = {
  comments: true,
  scripts: true,
  metadata: true,
  editorNamespaces: true,
  emptyAttributes: true,
  precision: 2,
  collapseWhitespace: true,
  responsive: false,
};

/** Editor-only prefixes; nothing in the SVG spec starts with any of them. */
const EDITOR_PREFIXES = ["inkscape", "sodipodi", "sketch", "figma", "adobe", "graph", "illustrator"];

/** Attributes whose values are coordinates or lengths worth rounding. */
const NUMERIC_ATTRS = [
  "d",
  "points",
  "transform",
  "viewBox",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "stroke-width",
  "offset",
  "stroke-dasharray",
  "stroke-dashoffset",
  "font-size",
];

/**
 * Round every number in a value, keeping the separators as they were.
 *
 * A path is a stream of numbers and command letters; treating it as text and
 * rewriting only the numeric runs avoids having to parse the grammar, and the
 * grammar is where a rewriter breaks arcs.
 */
export function roundNumbers(value: string, precision: number): string {
  if (precision < 0) return value;
  return value.replace(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g, (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return n;
    const r = Number(v.toFixed(precision));
    // "0.50" → "0.5", "3.00" → "3", and "-0" → "0": a sign on nothing is noise.
    return Object.is(r, -0) ? "0" : String(r);
  });
}

function stripComments(svg: string): string {
  return svg.replace(/<!--[\s\S]*?-->/g, "");
}

function stripProlog(svg: string): string {
  return svg.replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[^>]*>/gi, "");
}

function stripMetadata(svg: string): string {
  let out = svg.replace(/<metadata[\s\S]*?<\/metadata>/gi, "");
  for (const p of EDITOR_PREFIXES) {
    out = out
      .replace(new RegExp(`<${p}:[a-zA-Z-]+[\\s\\S]*?<\\/${p}:[a-zA-Z-]+>`, "g"), "")
      .replace(new RegExp(`<${p}:[a-zA-Z-]+[^>]*/>`, "g"), "");
  }
  return out;
}

function stripEditorAttributes(svg: string): string {
  let out = svg;
  for (const p of EDITOR_PREFIXES) {
    out = out
      .replace(new RegExp(`\\s${p}:[a-zA-Z-]+\\s*=\\s*"[^"]*"`, "g"), "")
      .replace(new RegExp(`\\s${p}:[a-zA-Z-]+\\s*=\\s*'[^']*'`, "g"), "")
      .replace(new RegExp(`\\sxmlns:${p}\\s*=\\s*"[^"]*"`, "g"), "");
  }
  // `xml:space="preserve"` only matters for text layout an editor already
  // baked in; `version` has been ignored since SVG 2.
  return out.replace(/\sxml:space\s*=\s*"[^"]*"/g, "").replace(/\sversion\s*=\s*"1\.\d"/g, "");
}

/**
 * SVG is a document format, not an image format: it can carry `<script>` and
 * `onload` handlers, and they run when the file is opened in a browser or
 * inlined into a page. An icon never needs either, so they come out by
 * default — the one transform here that is about safety rather than size.
 */
function stripScripts(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]*\/>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
}

function stripEmptyAttributes(svg: string): string {
  // An empty id or class does nothing, and an empty style is a leftover.
  return svg.replace(/\s(id|class|style)\s*=\s*"\s*"/g, "");
}

function applyPrecision(svg: string, precision: number): string {
  if (precision < 0) return svg;
  const attrs = NUMERIC_ATTRS.join("|");
  return svg.replace(
    new RegExp(`\\s(${attrs})\\s*=\\s*"([^"]*)"`, "g"),
    (_m, name: string, value: string) => ` ${name}="${roundNumbers(value, precision).replace(/\s+/g, " ").trim()}"`,
  );
}

function collapse(svg: string): string {
  return svg
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\/>/g, "/>")
    .trim();
}

function makeResponsive(svg: string): string {
  // Only safe when a viewBox is there to take over; otherwise the drawing
  // loses its size entirely.
  if (!/viewBox\s*=/.test(svg)) return svg;
  return svg.replace(/<svg\b[^>]*>/, (tag) =>
    tag.replace(/\s(width|height)\s*=\s*"[^"]*"/g, ""),
  );
}

export interface SvgResult {
  svg: string;
  before: number;
  after: number;
  /** 0–1; 0 when nothing was saved. */
  saved: number;
}

export function optimise(source: string, opts: SvgOptions = {}): SvgResult {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  const before = new TextEncoder().encode(source).length;

  let svg = source;
  if (o.comments) svg = stripComments(svg);
  svg = stripProlog(svg);
  if (o.scripts) svg = stripScripts(svg);
  if (o.metadata) svg = stripMetadata(svg);
  if (o.editorNamespaces) svg = stripEditorAttributes(svg);
  if (o.emptyAttributes) svg = stripEmptyAttributes(svg);
  svg = applyPrecision(svg, o.precision);
  if (o.responsive) svg = makeResponsive(svg);
  if (o.collapseWhitespace) svg = collapse(svg);

  const after = new TextEncoder().encode(svg).length;
  return { svg, before, after, saved: before ? Math.max(0, 1 - after / before) : 0 };
}

/** Rough sanity check that the text is an SVG at all. */
export function looksLikeSvg(text: string): boolean {
  return /<svg[\s>]/i.test(text);
}

/** A data: URL of the markup, for pasting into CSS. */
export function toDataUri(svg: string): string {
  // Percent-encoding only what a URL and a CSS url() actually mind keeps the
  // result far shorter than base64, which inflates by a third.
  const encoded = svg
    .replace(/"/g, "'")
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/\{/g, "%7B")
    .replace(/\}/g, "%7D")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/\s+/g, " ");
  return `data:image/svg+xml,${encoded}`;
}
