/**
 * Declarative descriptions of every "files in → settings → files out" tool.
 * ToolRunner.vue turns these into working pages, which is why PDF/image
 * tools no longer need one hand-written Vue file each.
 */
import * as PDFService from "@bindings/hitool/services/pdfservice";
import * as ImageService from "@bindings/hitool/services/imageservice";
import type { BatchResult, FileInfo } from "@bindings/hitool/services/models";
import { formatBytes } from "../lib/backend";
import { t } from "../lib/i18n";
import { IMAGE_EXT, PDF_EXT } from "../lib/tools";

export type FieldType =
  | "segment"
  | "select"
  | "number"
  | "text"
  | "password"
  | "dir"
  | "switch"
  | "sizes";

export interface Field {
  key: string;
  type: FieldType;
  /** i18n key */
  label?: string;
  hint?: string;
  placeholder?: string;
  options?: { value: string | number; label?: string }[];
  choices?: number[];
  min?: number;
  max?: number;
  step?: number;
  mono?: boolean;
  default: unknown;
  /** Only render when this predicate passes (e.g. span only in "span" mode). */
  when?: (v: Record<string, any>) => boolean;
}

export interface RunOutput {
  path: string;
  name: string;
  detail: string;
  ok: boolean;
}

export interface RunResult {
  outputs: RunOutput[];
  outputDir: string;
  error?: string;
}

export interface ToolManifest {
  id: string;
  accept: string[];
  filterName: string;
  multiple: boolean;
  ordered?: boolean;
  /** Minimum files before Run enables. */
  minFiles: number;
  /** Sub-folder under ~/Documents/HiTool. */
  outputBucket: string;
  fields: Field[];
  /** Extra guard beyond file count; returns an i18n key when blocked. */
  validate?: (v: Record<string, any>) => string | undefined;
  /** Backend supports mid-flight cancellation. */
  cancellable?: boolean;
  run: (ctx: {
    files: FileInfo[];
    v: Record<string, any>;
    outDir: string;
  }) => Promise<RunResult>;
}

const baseName = (p: string) => p.split(/[\\/]/).pop() || p;

/** Shared shape for the batch services, which all report the same result. */
function batchResult(
  res: BatchResult | null,
  outDir: string,
  detail?: (r: BatchResult) => string,
): RunResult {
  if (!res) return { outputs: [], outputDir: outDir, error: "no result" };
  const outputs: RunOutput[] = [];
  if (res.successCount > 0) {
    outputs.push({
      path: res.outputDir || outDir,
      name: t("bench.nFiles", { n: res.successCount }),
      detail: detail ? detail(res) : "",
      ok: true,
    });
  }
  return {
    outputs,
    outputDir: res.outputDir || outDir,
    error: res.failCount > 0 ? (res.errors ?? []).slice(0, 3).join("\n") : undefined,
  };
}

function single(
  res: { success: boolean; outputPath: string; error?: string } | null,
  outDir: string,
  detail = "",
): RunResult {
  if (!res) return { outputs: [], outputDir: outDir, error: "no result" };
  if (!res.success) return { outputs: [], outputDir: outDir, error: res.error || "failed" };
  return {
    outputs: [{ path: res.outputPath, name: baseName(res.outputPath), detail, ok: true }],
    outputDir: outDir,
  };
}

const dirField = (): Field => ({
  key: "outDir",
  type: "dir",
  label: "bench.outputDir",
  default: "",
});

const pageRangeField = (label: string, hint = "pdf.rangeHint"): Field => ({
  key: "pages",
  type: "text",
  label,
  hint,
  placeholder: "pdf.rangePlaceholder",
  mono: true,
  default: "",
});

export const MANIFESTS: ToolManifest[] = [
  // ---------------- PDF ----------------
  {
    id: "pdf-merge",
    accept: PDF_EXT,
    filterName: "PDF",
    multiple: true,
    ordered: true,
    minFiles: 2,
    outputBucket: "PDF",
    fields: [dirField()],
    async run({ files, outDir }) {
      const res = await PDFService.Merge(files.map((f) => f.path), outDir);
      return single(res, outDir, `${files.length} → 1`);
    },
  },
  {
    id: "pdf-split",
    accept: PDF_EXT,
    filterName: "PDF",
    multiple: false,
    minFiles: 1,
    outputBucket: "PDF",
    fields: [
      {
        key: "mode",
        type: "segment",
        label: "pdf.splitMode",
        options: [
          { value: "each", label: "pdf.splitEach" },
          { value: "span", label: "pdf.splitSpan" },
          { value: "range", label: "pdf.splitRange" },
        ],
        default: "each",
      },
      {
        key: "span",
        type: "number",
        label: "pdf.span",
        min: 2,
        max: 500,
        default: 2,
        when: (v) => v.mode === "span",
      },
      { ...pageRangeField("pdf.range"), when: (v) => v.mode === "range" },
      dirField(),
    ],
    validate: (v) => (v.mode === "range" && !String(v.pages).trim() ? "pdf.rangeRequired" : undefined),
    async run({ files, v, outDir }) {
      const res = await PDFService.Split(files[0].path, outDir, v.mode, v.span, v.pages);
      if (!res?.success) return { outputs: [], outputDir: outDir, error: res?.error || "failed" };
      const list = res.outputFiles ?? [];
      return {
        outputDir: res.outputDir || outDir,
        outputs: list.slice(0, 30).map((p) => ({
          path: p,
          name: baseName(p),
          detail: "",
          ok: true,
        })),
      };
    },
  },
  {
    id: "pdf-rotate",
    accept: PDF_EXT,
    filterName: "PDF",
    multiple: false,
    minFiles: 1,
    outputBucket: "PDF",
    fields: [
      {
        key: "degrees",
        type: "segment",
        label: "pdf.angle",
        options: [
          { value: 90, label: "pdf.deg90" },
          { value: 180, label: "pdf.deg180" },
          { value: 270, label: "pdf.deg270" },
        ],
        default: 90,
      },
      pageRangeField("pdf.pagesOptional"),
      dirField(),
    ],
    async run({ files, v, outDir }) {
      const res = await PDFService.Rotate(files[0].path, outDir, v.degrees, v.pages);
      return single(res, outDir, `${v.degrees}°`);
    },
  },
  {
    id: "pdf-encrypt",
    accept: PDF_EXT,
    filterName: "PDF",
    multiple: false,
    minFiles: 1,
    outputBucket: "PDF",
    fields: [
      {
        key: "mode",
        type: "segment",
        label: "pdf.lockMode",
        options: [
          { value: "encrypt", label: "pdf.lockEncrypt" },
          { value: "decrypt", label: "pdf.lockDecrypt" },
        ],
        default: "encrypt",
      },
      {
        key: "password",
        type: "password",
        label: "pdf.password",
        placeholder: "pdf.passwordPh",
        default: "",
      },
      {
        key: "confirm",
        type: "password",
        label: "pdf.confirm",
        placeholder: "pdf.passwordPh",
        default: "",
        when: (v) => v.mode !== "decrypt",
      },
      dirField(),
    ],
    validate: (v) => {
      if (!v.password) return "pdf.passwordRequired";
      if (v.mode !== "decrypt" && v.password !== v.confirm) return "pdf.mismatch";
      return undefined;
    },
    async run({ files, v, outDir }) {
      if (v.mode === "decrypt") {
        const res = await PDFService.Decrypt(files[0].path, outDir, v.password);
        return single(res, outDir);
      }
      const res = await PDFService.Encrypt(files[0].path, outDir, v.password, "");
      return single(res, outDir, "AES-256");
    },
  },
  {
    id: "pdf-compress",
    accept: PDF_EXT,
    filterName: "PDF",
    multiple: false,
    minFiles: 1,
    outputBucket: "PDF",
    fields: [dirField()],
    async run({ files, outDir }) {
      const res = await PDFService.Compress(files[0].path, outDir);
      if (!res?.success) return { outputs: [], outputDir: outDir, error: res?.error || "failed" };
      const before = res.inputSize ?? 0;
      const after = res.outputSize ?? 0;
      const pct = before > 0 ? Math.round((1 - after / before) * 1000) / 10 : 0;
      return single(res, outDir, `${formatBytes(before)} → ${formatBytes(after)} · −${pct}%`);
    },
  },

  // ---------------- Image ----------------
  {
    id: "image-convert",
    accept: IMAGE_EXT,
    filterName: "Images",
    multiple: true,
    minFiles: 1,
    outputBucket: "Images",
    cancellable: true,
    fields: [
      {
        key: "format",
        type: "segment",
        label: "image.targetFormat",
        options: [
          { value: "PNG" },
          { value: "JPG" },
          { value: "WEBP" },
          { value: "BMP" },
          { value: "GIF" },
        ],
        default: "PNG",
      },
      dirField(),
    ],
    async run({ files, v, outDir }) {
      const res = await ImageService.ConvertBatch(files.map((f) => f.path), outDir, v.format);
      return batchResult(res, outDir, (r) => `→ ${v.format} · ${r.successCount}/${files.length}`);
    },
  },
  {
    id: "image-compress",
    accept: IMAGE_EXT,
    filterName: "Images",
    multiple: true,
    minFiles: 1,
    outputBucket: "Images",
    cancellable: true,
    fields: [
      {
        key: "quality",
        type: "segment",
        label: "image.quality",
        options: [
          { value: "high", label: "image.qualityHigh" },
          { value: "medium", label: "image.qualityMedium" },
          { value: "low", label: "image.qualityLow" },
        ],
        default: "medium",
      },
      dirField(),
    ],
    async run({ files, v, outDir }) {
      const res = await ImageService.CompressBatch(files.map((f) => f.path), outDir, v.quality);
      return batchResult(res, outDir, (r) => {
        // Both sizes are optional on the wire — report the ratio only when
        // the backend actually measured, never a "−100%" built from a zero.
        const before = r.originalSize ?? 0;
        const after = r.compressedSize ?? 0;
        if (!before || !after) return `${r.successCount}/${files.length}`;
        const pct = Math.round((1 - after / before) * 1000) / 10;
        return `${formatBytes(before)} → ${formatBytes(after)} · −${pct}%`;
      });
    },
  },
  {
    id: "icon-gen",
    accept: IMAGE_EXT,
    filterName: "Images",
    multiple: false,
    minFiles: 1,
    outputBucket: "Icons",
    fields: [
      {
        key: "sizes",
        type: "sizes",
        label: "image.iconSizes",
        choices: [16, 32, 48, 64, 128, 256, 512, 1024],
        default: [16, 32, 48, 64, 128, 256, 512],
      },
      { key: "ico", type: "switch", label: "image.makeIco", default: true },
      { key: "icns", type: "switch", label: "image.makeIcns", default: true },
      dirField(),
    ],
    validate: (v) => ((v.sizes as number[]).length ? undefined : "image.sizesRequired"),
    async run({ files, v, outDir }) {
      const res = await ImageService.GenerateIcons(
        files[0].path,
        outDir,
        v.sizes,
        v.ico,
        v.icns,
      );
      if (!res?.success) return { outputs: [], outputDir: outDir, error: res?.error || "failed" };
      const list = res.files ?? [];
      return {
        outputDir: res.outputDir || outDir,
        outputs: list.map((p) => ({ path: p, name: baseName(p), detail: "", ok: true })),
      };
    },
  },

  {
    id: "image-resize",
    accept: IMAGE_EXT,
    filterName: "Images",
    multiple: true,
    minFiles: 1,
    outputBucket: "Images",
    cancellable: true,
    fields: [
      {
        key: "mode",
        type: "segment",
        label: "resize.mode",
        options: [
          { value: "fit", label: "resize.modeFit" },
          { value: "fill", label: "resize.modeFill" },
          { value: "exact", label: "resize.modeExact" },
          { value: "longEdge", label: "resize.modeLongEdge" },
          { value: "percent", label: "resize.modePercent" },
        ],
        default: "fit",
      },
      {
        key: "width",
        type: "number",
        label: "resize.width",
        min: 1,
        max: 20000,
        default: 1920,
        when: (v) => v.mode !== "percent",
      },
      {
        key: "height",
        type: "number",
        label: "resize.height",
        min: 0,
        max: 20000,
        default: 1080,
        when: (v) => v.mode === "fit" || v.mode === "fill" || v.mode === "exact",
      },
      {
        key: "percent",
        type: "number",
        label: "resize.percent",
        min: 1,
        max: 1000,
        default: 50,
        when: (v) => v.mode === "percent",
      },
      {
        key: "format",
        type: "select",
        label: "resize.format",
        options: [
          { value: "", label: "resize.keepFormat" },
          { value: "PNG" },
          { value: "JPG" },
          { value: "WEBP" },
        ],
        default: "",
      },
      {
        key: "quality",
        type: "number",
        label: "resize.quality",
        min: 1,
        max: 100,
        default: 90,
      },
      dirField(),
    ],
    validate: (v) => {
      if (v.mode === "exact" && (!v.width || !v.height)) return "resize.needBoth";
      if (v.mode !== "percent" && !v.width) return "resize.needWidth";
      return undefined;
    },
    async run({ files, v, outDir }) {
      // "percent" reuses the width slot, which is what the Go side expects.
      const w = v.mode === "percent" ? Number(v.percent) : Number(v.width);
      const h = v.mode === "percent" ? 0 : Number(v.height ?? 0);
      const res = await ImageService.ResizeBatch(
        files.map((f) => f.path),
        outDir,
        v.mode,
        w,
        h,
        Number(v.quality),
        v.format,
      );
      return batchResult(res, outDir, (r) => `${r.successCount}/${files.length}`);
    },
  },
  {
    id: "image-to-pdf",
    accept: IMAGE_EXT,
    filterName: "Images",
    multiple: true,
    ordered: true,
    minFiles: 1,
    outputBucket: "PDF",
    fields: [
      {
        key: "pageSize",
        type: "select",
        label: "img2pdf.pageSize",
        options: [
          { value: "auto", label: "img2pdf.auto" },
          { value: "A4" },
          { value: "A3" },
          { value: "A5" },
          { value: "Letter" },
          { value: "Legal" },
        ],
        default: "auto",
      },
      {
        key: "landscape",
        type: "switch",
        label: "img2pdf.landscape",
        default: false,
        when: (v) => v.pageSize !== "auto",
      },
      dirField(),
    ],
    async run({ files, v, outDir }) {
      const res = await PDFService.FromImages(
        files.map((f) => f.path),
        outDir,
        v.pageSize,
        !!v.landscape,
      );
      return single(res, outDir, `${files.length} → 1`);
    },
  },
];

export function manifestFor(id: string): ToolManifest | undefined {
  return MANIFESTS.find((m) => m.id === id);
}

export function defaultValues(m: ToolManifest): Record<string, any> {
  const v: Record<string, any> = {};
  for (const f of m.fields) {
    v[f.key] = Array.isArray(f.default) ? [...(f.default as unknown[])] : f.default;
  }
  return v;
}
