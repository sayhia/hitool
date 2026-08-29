package services

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"math"
	"image/gif"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"

	"github.com/HugoSmits86/nativewebp"
	"github.com/jackmordaunt/icns/v3"
	"github.com/wailsapp/wails/v3/pkg/application"
	"golang.org/x/image/bmp"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/tiff"
	_ "golang.org/x/image/webp"
)

// ImageService: Pixel Lab tools — batch convert, batch compress, icon generation.
type ImageService struct {
	store  *StoreService
	cancel atomic.Bool
}

func NewImageService(store *StoreService) *ImageService {
	return &ImageService{store: store}
}

type ConvertProgress struct {
	FileName string  `json:"fileName"`
	Current  int     `json:"current"`
	Total    int     `json:"total"`
	Progress float64 `json:"progress"`
	Status   string  `json:"status"` // converting | done | error
}

type BatchResult struct {
	SuccessCount   int      `json:"successCount"`
	FailCount      int      `json:"failCount"`
	OutputDir      string   `json:"outputDir"`
	Errors         []string `json:"errors"`
	OriginalSize   int64    `json:"originalSize,omitempty"`
	CompressedSize int64    `json:"compressedSize,omitempty"`
}

func emitProgress(p ConvertProgress) {
	if app := application.Get(); app != nil {
		app.Event.Emit("convert-progress", p)
	}
}

func decodeImage(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	return img, err
}

func encodeImage(img image.Image, format string, quality int, w *bytes.Buffer) (string, error) {
	switch strings.ToUpper(format) {
	case "JPG", "JPEG":
		// JPEG has no alpha channel — composite onto white like most converters.
		return ".jpg", jpeg.Encode(w, flattenOnWhite(img), &jpeg.Options{Quality: quality})
	case "PNG":
		enc := png.Encoder{CompressionLevel: png.DefaultCompression}
		if quality <= 40 {
			enc.CompressionLevel = png.BestCompression
		}
		return ".png", enc.Encode(w, img)
	case "WEBP":
		return ".webp", nativewebp.Encode(w, img, nil)
	case "BMP":
		return ".bmp", bmp.Encode(w, img)
	case "GIF":
		return ".gif", gif.Encode(w, img, &gif.Options{NumColors: 256})
	default:
		return "", fmt.Errorf("unsupported target format: %s", format)
	}
}

func flattenOnWhite(img image.Image) image.Image {
	b := img.Bounds()
	out := image.NewRGBA(b)
	draw.Draw(out, b, image.White, image.Point{}, draw.Src)
	draw.Draw(out, b, img, b.Min, draw.Over)
	return out
}

func (s *ImageService) Cancel() {
	s.cancel.Store(true)
}

// ConvertBatch converts each input into targetFormat inside outDir.
func (s *ImageService) ConvertBatch(inputs []string, outDir string, targetFormat string) (*BatchResult, error) {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}
	s.cancel.Store(false)
	res := &BatchResult{OutputDir: outDir, Errors: []string{}}
	total := len(inputs)
	for i, in := range inputs {
		if s.cancel.Load() {
			break
		}
		name := filepath.Base(in)
		emitProgress(ConvertProgress{FileName: name, Current: i + 1, Total: total, Status: "converting"})
		err := func() error {
			img, err := decodeImage(in)
			if err != nil {
				return err
			}
			var buf bytes.Buffer
			ext, err := encodeImage(img, targetFormat, 90, &buf)
			if err != nil {
				return err
			}
			out := UniqueOutputPath(outDir, stemOf(in), ext)
			return os.WriteFile(out, buf.Bytes(), 0o644)
		}()
		if err != nil {
			res.FailCount++
			res.Errors = append(res.Errors, fmt.Sprintf("%s: %v", name, err))
			emitProgress(ConvertProgress{FileName: name, Current: i + 1, Total: total, Progress: 1, Status: "error"})
		} else {
			res.SuccessCount++
			emitProgress(ConvertProgress{FileName: name, Current: i + 1, Total: total, Progress: 1, Status: "done"})
		}
	}
	if s.store != nil && res.SuccessCount > 0 {
		_ = s.store.AddHistory("image-convert", fmt.Sprintf("%d -> %s", res.SuccessCount, strings.ToUpper(targetFormat)))
	}
	return res, nil
}

// CompressBatch re-encodes images with quality presets high/medium/low,
// keeping each file's original format.
func (s *ImageService) CompressBatch(inputs []string, outDir string, quality string) (*BatchResult, error) {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}
	s.cancel.Store(false)
	jpegQ := 65
	switch quality {
	case "high":
		jpegQ = 90
	case "low":
		jpegQ = 35
	}
	res := &BatchResult{OutputDir: outDir, Errors: []string{}}
	total := len(inputs)
	for i, in := range inputs {
		if s.cancel.Load() {
			break
		}
		name := filepath.Base(in)
		emitProgress(ConvertProgress{FileName: name, Current: i + 1, Total: total, Status: "converting"})
		err := func() error {
			img, err := decodeImage(in)
			if err != nil {
				return err
			}
			format := strings.TrimPrefix(strings.ToLower(filepath.Ext(in)), ".")
			if format == "" || format == "jpeg" {
				format = "jpg"
			}
			var buf bytes.Buffer
			ext, err := encodeImage(img, format, jpegQ, &buf)
			if err != nil {
				return err
			}
			out := UniqueOutputPath(outDir, stemOf(in), ext)
			if err := os.WriteFile(out, buf.Bytes(), 0o644); err != nil {
				return err
			}
			res.OriginalSize += fileSizeOf(in)
			res.CompressedSize += int64(buf.Len())
			return nil
		}()
		if err != nil {
			res.FailCount++
			res.Errors = append(res.Errors, fmt.Sprintf("%s: %v", name, err))
			emitProgress(ConvertProgress{FileName: name, Current: i + 1, Total: total, Progress: 1, Status: "error"})
		} else {
			res.SuccessCount++
			emitProgress(ConvertProgress{FileName: name, Current: i + 1, Total: total, Progress: 1, Status: "done"})
		}
	}
	if s.store != nil && res.SuccessCount > 0 {
		_ = s.store.AddHistory("image-compress", fmt.Sprintf("%d files, %s", res.SuccessCount, quality))
	}
	return res, nil
}

type IconResult struct {
	Success   bool     `json:"success"`
	OutputDir string   `json:"outputDir"`
	Files     []string `json:"files"`
	Error     string   `json:"error,omitempty"`
}

// GenerateIcons renders the source image into standard app-icon sizes and
// bundles ICO (Windows) plus ICNS (macOS) containers.
func (s *ImageService) GenerateIcons(input string, outDir string, sizes []int, makeICO bool, makeICNS bool) (*IconResult, error) {
	if len(sizes) == 0 {
		sizes = []int{16, 32, 48, 64, 128, 256, 512}
	}
	src, err := decodeImage(input)
	if err != nil {
		return &IconResult{Success: false, Error: fmt.Sprintf("decode: %v", err)}, nil
	}
	sub := UniqueOutputPath(outDir, stemOf(input)+"_icons", "")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		return nil, err
	}
	files := []string{}
	pngBySize := map[int][]byte{}
	for _, size := range sizes {
		if size < 8 || size > 1024 {
			continue
		}
		dst := image.NewRGBA(image.Rect(0, 0, size, size))
		draw.CatmullRom.Scale(dst, dst.Bounds(), src, squareCrop(src.Bounds()), draw.Over, nil)
		var buf bytes.Buffer
		if err := png.Encode(&buf, dst); err != nil {
			return &IconResult{Success: false, Error: err.Error()}, nil
		}
		out := filepath.Join(sub, fmt.Sprintf("icon_%dx%d.png", size, size))
		if err := os.WriteFile(out, buf.Bytes(), 0o644); err != nil {
			return &IconResult{Success: false, Error: err.Error()}, nil
		}
		pngBySize[size] = buf.Bytes()
		files = append(files, out)
	}
	if makeICO {
		icoSizes := []int{16, 32, 48, 64, 128, 256}
		out := filepath.Join(sub, "icon.ico")
		if err := writeICO(out, icoSizes, pngBySize, src); err == nil {
			files = append(files, out)
		}
	}
	if makeICNS {
		out := filepath.Join(sub, "icon.icns")
		f, err := os.Create(out)
		if err == nil {
			big := image.NewRGBA(image.Rect(0, 0, 1024, 1024))
			draw.CatmullRom.Scale(big, big.Bounds(), src, squareCrop(src.Bounds()), draw.Over, nil)
			if err := icns.Encode(f, big); err == nil {
				files = append(files, out)
			}
			f.Close()
		}
	}
	if s.store != nil {
		_ = s.store.AddHistory("icon-gen", filepath.Base(input))
	}
	return &IconResult{Success: true, OutputDir: sub, Files: files}, nil
}

// squareCrop returns the centered square region of r.
func squareCrop(r image.Rectangle) image.Rectangle {
	w, h := r.Dx(), r.Dy()
	if w == h {
		return r
	}
	if w > h {
		off := (w - h) / 2
		return image.Rect(r.Min.X+off, r.Min.Y, r.Min.X+off+h, r.Max.Y)
	}
	off := (h - w) / 2
	return image.Rect(r.Min.X, r.Min.Y+off, r.Max.X, r.Min.Y+off+w)
}

// writeICO emits a PNG-compressed ICO container (supported since Vista).
func writeICO(path string, sizes []int, pngBySize map[int][]byte, src image.Image) error {
	type entry struct {
		size int
		data []byte
	}
	entries := []entry{}
	for _, s := range sizes {
		data, ok := pngBySize[s]
		if !ok {
			dst := image.NewRGBA(image.Rect(0, 0, s, s))
			draw.CatmullRom.Scale(dst, dst.Bounds(), src, squareCrop(src.Bounds()), draw.Over, nil)
			var buf bytes.Buffer
			if err := png.Encode(&buf, dst); err != nil {
				continue
			}
			data = buf.Bytes()
		}
		entries = append(entries, entry{s, data})
	}
	if len(entries) == 0 {
		return fmt.Errorf("no icon entries")
	}
	var out bytes.Buffer
	// ICONDIR
	writeU16 := func(v int) { out.WriteByte(byte(v)); out.WriteByte(byte(v >> 8)) }
	writeU32 := func(v int) {
		out.WriteByte(byte(v))
		out.WriteByte(byte(v >> 8))
		out.WriteByte(byte(v >> 16))
		out.WriteByte(byte(v >> 24))
	}
	writeU16(0) // reserved
	writeU16(1) // type: icon
	writeU16(len(entries))
	offset := 6 + 16*len(entries)
	for _, e := range entries {
		dim := e.size
		if dim >= 256 {
			dim = 0 // 0 means 256 in ICO
		}
		out.WriteByte(byte(dim)) // width
		out.WriteByte(byte(dim)) // height
		out.WriteByte(0)         // palette
		out.WriteByte(0)         // reserved
		writeU16(1)              // color planes
		writeU16(32)             // bpp
		writeU32(len(e.data))
		writeU32(offset)
		offset += len(e.data)
	}
	for _, e := range entries {
		out.Write(e.data)
	}
	return os.WriteFile(path, out.Bytes(), 0o644)
}

// ---------------- resize ----------------

// ResizeMode decides how the target box is interpreted.
//
//	fit     — scale down to fit inside w×h, keeping the aspect ratio (never upscales)
//	fill     — scale to cover w×h, then centre-crop the overflow
//	exact    — stretch to exactly w×h, aspect ratio be damned
//	percent  — scale both axes by w percent (h ignored)
//	longEdge — scale so the longer side becomes w
type ResizeMode string

// resizeTarget computes the output size, and for `fill` also the source
// rectangle to sample from.
func resizeTarget(src image.Rectangle, mode ResizeMode, w, h int) (dst image.Rectangle, sample image.Rectangle) {
	sw, sh := src.Dx(), src.Dy()
	if sw == 0 || sh == 0 {
		return image.Rect(0, 0, 1, 1), src
	}

	switch mode {
	case "percent":
		p := float64(w) / 100
		if p <= 0 {
			p = 1
		}
		return image.Rect(0, 0, maxInt(1, int(float64(sw)*p)), maxInt(1, int(float64(sh)*p))), src

	case "longEdge":
		if w <= 0 {
			return image.Rect(0, 0, sw, sh), src
		}
		if sw >= sh {
			return image.Rect(0, 0, w, maxInt(1, sh*w/sw)), src
		}
		return image.Rect(0, 0, maxInt(1, sw*w/sh), w), src

	case "exact":
		return image.Rect(0, 0, maxInt(1, w), maxInt(1, h)), src

	case "fill":
		if w <= 0 || h <= 0 {
			return image.Rect(0, 0, sw, sh), src
		}
		// Pick the largest source rect with the target aspect ratio, centred.
		srcAspect := float64(sw) / float64(sh)
		dstAspect := float64(w) / float64(h)
		cw, ch := sw, sh
		if srcAspect > dstAspect {
			cw = int(float64(sh) * dstAspect)
		} else {
			ch = int(float64(sw) / dstAspect)
		}
		ox := src.Min.X + (sw-cw)/2
		oy := src.Min.Y + (sh-ch)/2
		return image.Rect(0, 0, w, h), image.Rect(ox, oy, ox+cw, oy+ch)

	default: // "fit"
		if w <= 0 && h <= 0 {
			return image.Rect(0, 0, sw, sh), src
		}
		if w <= 0 {
			w = sw * h / maxInt(1, sh)
		}
		if h <= 0 {
			h = sh * w / maxInt(1, sw)
		}
		// Never enlarge: fitting a small image into a big box just pads it.
		scale := math.Min(float64(w)/float64(sw), float64(h)/float64(sh))
		if scale > 1 {
			scale = 1
		}
		return image.Rect(0, 0, maxInt(1, int(float64(sw)*scale)), maxInt(1, int(float64(sh)*scale))), src
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// ResizeBatch rescales each input. `format` may be empty to keep the original.
func (s *ImageService) ResizeBatch(
	inputs []string, outDir string, mode string, width, height, quality int, format string,
) (*BatchResult, error) {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}
	s.cancel.Store(false)
	if quality <= 0 || quality > 100 {
		quality = 90
	}

	res := &BatchResult{OutputDir: outDir, Errors: []string{}}
	total := len(inputs)
	for i, in := range inputs {
		if s.cancel.Load() {
			break
		}
		name := filepath.Base(in)
		emitProgress(ConvertProgress{FileName: name, Current: i + 1, Total: total, Status: "converting"})

		err := func() error {
			img, err := decodeImage(in)
			if err != nil {
				return err
			}
			dstRect, sample := resizeTarget(img.Bounds(), ResizeMode(mode), width, height)
			dst := image.NewRGBA(dstRect)
			draw.CatmullRom.Scale(dst, dstRect, img, sample, draw.Over, nil)

			outFormat := format
			if outFormat == "" {
				outFormat = strings.TrimPrefix(strings.ToLower(filepath.Ext(in)), ".")
				if outFormat == "" || outFormat == "jpeg" {
					outFormat = "jpg"
				}
			}
			var buf bytes.Buffer
			ext, err := encodeImage(dst, outFormat, quality, &buf)
			if err != nil {
				return err
			}
			out := UniqueOutputPath(outDir, stemOf(in), ext)
			if err := os.WriteFile(out, buf.Bytes(), 0o644); err != nil {
				return err
			}
			res.OriginalSize += fileSizeOf(in)
			res.CompressedSize += int64(buf.Len())
			return nil
		}()

		if err != nil {
			res.FailCount++
			res.Errors = append(res.Errors, fmt.Sprintf("%s: %v", name, err))
			emitProgress(ConvertProgress{FileName: name, Current: i + 1, Total: total, Progress: 1, Status: "error"})
		} else {
			res.SuccessCount++
			emitProgress(ConvertProgress{FileName: name, Current: i + 1, Total: total, Progress: 1, Status: "done"})
		}
	}

	if s.store != nil && res.SuccessCount > 0 {
		_ = s.store.AddHistory("image-resize", fmt.Sprintf("%d files, %s", res.SuccessCount, mode))
	}
	return res, nil
}

// ProbeImage reports an image's pixel dimensions without decoding the pixels.
type ImageInfo struct {
	Path   string `json:"path"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Format string `json:"format"`
	Error  string `json:"error,omitempty"`
}

func (s *ImageService) ProbeImages(paths []string) []ImageInfo {
	out := make([]ImageInfo, 0, len(paths))
	for _, p := range paths {
		info := ImageInfo{Path: p}
		f, err := os.Open(p)
		if err != nil {
			info.Error = err.Error()
			out = append(out, info)
			continue
		}
		cfg, format, err := image.DecodeConfig(f)
		f.Close()
		if err != nil {
			info.Error = err.Error()
		} else {
			info.Width, info.Height, info.Format = cfg.Width, cfg.Height, format
		}
		out = append(out, info)
	}
	return out
}

// ---------------- watermark ----------------

// WatermarkAnchor names the nine placement positions plus tiling.
type WatermarkAnchor string

// anchorRect places a mark of size mw×mh inside a page of pw×ph.
func anchorRect(anchor string, pw, ph, mw, mh, margin int) image.Rectangle {
	var x, y int
	switch anchor {
	case "tl":
		x, y = margin, margin
	case "tc":
		x, y = (pw-mw)/2, margin
	case "tr":
		x, y = pw-mw-margin, margin
	case "ml":
		x, y = margin, (ph-mh)/2
	case "mc":
		x, y = (pw-mw)/2, (ph-mh)/2
	case "mr":
		x, y = pw-mw-margin, (ph-mh)/2
	case "bl":
		x, y = margin, ph-mh-margin
	case "bc":
		x, y = (pw-mw)/2, ph-mh-margin
	default: // "br"
		x, y = pw-mw-margin, ph-mh-margin
	}
	return image.Rect(x, y, x+mw, y+mh)
}

// alphaMask scales a watermark's alpha by opacity (0–100).
type alphaMask struct {
	bounds image.Rectangle
	alpha  uint8
}

func (m *alphaMask) ColorModel() color.Model { return color.AlphaModel }
func (m *alphaMask) Bounds() image.Rectangle { return m.bounds }
func (m *alphaMask) At(x, y int) color.Color { return color.Alpha{A: m.alpha} }

// WatermarkBatch stamps a PNG watermark onto every input.
//
// The watermark arrives as base64 PNG rather than a path so the front end can
// render text with the webview's own fonts — Go has no CJK face to draw with,
// and shipping one would bloat the binary for a feature the browser does well.
//
// `scalePct` sizes the mark relative to the image's shorter side, so the same
// settings look consistent across a batch of mixed dimensions.
func (s *ImageService) WatermarkBatch(
	inputs []string, outDir string, markPNG string, anchor string,
	scalePct int, opacity int, marginPct int, tile bool, quality int,
) (*BatchResult, error) {
	if strings.TrimSpace(markPNG) == "" {
		return nil, fmt.Errorf("no watermark supplied")
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}
	s.cancel.Store(false)

	raw, err := base64.StdEncoding.DecodeString(
		strings.TrimPrefix(markPNG, "data:image/png;base64,"),
	)
	if err != nil {
		return nil, fmt.Errorf("watermark is not valid base64 PNG: %w", err)
	}
	mark, err := png.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("watermark is not a readable PNG: %w", err)
	}

	if scalePct <= 0 || scalePct > 200 {
		scalePct = 25
	}
	if opacity <= 0 || opacity > 100 {
		opacity = 60
	}
	if marginPct < 0 || marginPct > 40 {
		marginPct = 3
	}
	if quality <= 0 || quality > 100 {
		quality = 92
	}

	res := &BatchResult{OutputDir: outDir, Errors: []string{}}
	total := len(inputs)
	for i, in := range inputs {
		if s.cancel.Load() {
			break
		}
		name := filepath.Base(in)
		emitProgress(ConvertProgress{FileName: name, Current: i + 1, Total: total, Status: "converting"})

		err := func() error {
			src, err := decodeImage(in)
			if err != nil {
				return err
			}
			b := src.Bounds()
			out := image.NewRGBA(b)
			draw.Draw(out, b, src, b.Min, draw.Src)

			shorter := b.Dx()
			if b.Dy() < shorter {
				shorter = b.Dy()
			}
			mw := maxInt(1, shorter*scalePct/100)
			mh := maxInt(1, mark.Bounds().Dy()*mw/maxInt(1, mark.Bounds().Dx()))
			margin := shorter * marginPct / 100
			mask := &alphaMask{bounds: image.Rect(0, 0, b.Dx(), b.Dy()), alpha: uint8(opacity * 255 / 100)}

			if tile {
				// Leave half a mark of breathing room between repeats.
				stepX, stepY := mw+mw/2, mh+mh/2
				for y := b.Min.Y; y < b.Max.Y; y += stepY {
					for x := b.Min.X; x < b.Max.X; x += stepX {
						r := image.Rect(x, y, x+mw, y+mh)
						draw.CatmullRom.Scale(out, r, mark, mark.Bounds(), draw.Over, &draw.Options{DstMask: mask})
					}
				}
			} else {
				r := anchorRect(anchor, b.Dx(), b.Dy(), mw, mh, margin).Add(b.Min)
				draw.CatmullRom.Scale(out, r, mark, mark.Bounds(), draw.Over, &draw.Options{DstMask: mask})
			}

			format := strings.TrimPrefix(strings.ToLower(filepath.Ext(in)), ".")
			if format == "" || format == "jpeg" {
				format = "jpg"
			}
			var buf bytes.Buffer
			ext, err := encodeImage(out, format, quality, &buf)
			if err != nil {
				return err
			}
			dst := UniqueOutputPath(outDir, stemOf(in)+"_wm", ext)
			return os.WriteFile(dst, buf.Bytes(), 0o644)
		}()

		if err != nil {
			res.FailCount++
			res.Errors = append(res.Errors, fmt.Sprintf("%s: %v", name, err))
			emitProgress(ConvertProgress{FileName: name, Current: i + 1, Total: total, Progress: 1, Status: "error"})
		} else {
			res.SuccessCount++
			emitProgress(ConvertProgress{FileName: name, Current: i + 1, Total: total, Progress: 1, Status: "done"})
		}
	}

	if s.store != nil && res.SuccessCount > 0 {
		_ = s.store.AddHistory("image-watermark", fmt.Sprintf("%d files", res.SuccessCount))
	}
	return res, nil
}

func (s *ImageService) Anchors() []string {
	return []string{"tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"}
}

// Thumbnail returns a small JPEG preview of the image at path as a data
// URL, for the out-tray. Sources above 8 MB are skipped — a tray of outputs
// should never read gigabytes just to show a strip of thumbnails.
func (s *ImageService) Thumbnail(path string, max int) (string, error) {
	if max <= 0 || max > 512 {
		max = 96
	}
	fi, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if fi.Size() > 8<<20 {
		return "", nil
	}
	img, err := decodeImage(path)
	if err != nil {
		return "", err
	}
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if scale := float64(max) / math.Max(float64(w), float64(h)); scale < 1 {
		nw, nh := int(float64(w)*scale), int(float64(h)*scale)
		if nw < 1 {
			nw = 1
		}
		if nh < 1 {
			nh = 1
		}
		dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
		draw.ApproxBiLinear.Scale(dst, dst.Bounds(), img, b, draw.Over, nil)
		img = dst
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, flattenOnWhite(img), &jpeg.Options{Quality: 72}); err != nil {
		return "", err
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}
