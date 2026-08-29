package services

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"

	"github.com/makiuchi-d/gozxing"
	zxqr "github.com/makiuchi-d/gozxing/qrcode"
	qrcode "github.com/skip2/go-qrcode"
	"golang.org/x/image/draw"
)

// QRService encodes and decodes QR codes. Both directions run locally — the
// point of a local toolbox is that a payload with a password in it never
// leaves the machine.
type QRService struct {
	store *StoreService
}

func NewQRService(store *StoreService) *QRService {
	return &QRService{store: store}
}

// Recovery levels, lowest to highest. Higher tolerates more damage (and more
// logo overlay) at the cost of a denser code.
var qrLevels = map[string]qrcode.RecoveryLevel{
	"low":     qrcode.Low,
	"medium":  qrcode.Medium,
	"high":    qrcode.High,
	"highest": qrcode.Highest,
}

func (q *QRService) Levels() []string {
	return []string{"low", "medium", "high", "highest"}
}

func parseHexColor(s string, fallback color.Color) color.Color {
	t := strings.TrimPrefix(strings.TrimSpace(s), "#")
	if len(t) == 3 {
		t = string([]byte{t[0], t[0], t[1], t[1], t[2], t[2]})
	}
	if len(t) != 6 {
		return fallback
	}
	var r, g, b uint8
	if _, err := fmt.Sscanf(t, "%02x%02x%02x", &r, &g, &b); err != nil {
		return fallback
	}
	return color.RGBA{r, g, b, 255}
}

type QRResult struct {
	/** PNG bytes as base64, for previewing without touching disk. */
	DataURI string `json:"dataUri"`
	Size    int    `json:"size"`
	Error   string `json:"error,omitempty"`
}

// Encode renders text into a QR PNG and hands back a data URI. `logoPath` may
// be empty; when set it is scaled to ~22% of the code and centred, which the
// error correction absorbs at level "high" or better.
func (q *QRService) Encode(text string, size int, level string, fg string, bg string, logoPath string) (*QRResult, error) {
	if strings.TrimSpace(text) == "" {
		return &QRResult{Error: "nothing to encode"}, nil
	}
	if size < 64 || size > 4096 {
		size = 512
	}
	rl, ok := qrLevels[strings.ToLower(level)]
	if !ok {
		rl = qrcode.Medium
	}

	code, err := qrcode.New(text, rl)
	if err != nil {
		return &QRResult{Error: err.Error()}, nil
	}
	code.ForegroundColor = toRGBA(parseHexColor(fg, color.Black))
	code.BackgroundColor = toRGBA(parseHexColor(bg, color.White))

	img := code.Image(size)

	if logoPath != "" {
		merged, err := overlayLogo(img, logoPath)
		if err != nil {
			return &QRResult{Error: fmt.Sprintf("logo: %v", err)}, nil
		}
		img = merged
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return &QRResult{Error: err.Error()}, nil
	}
	if q.store != nil {
		_ = q.store.AddHistory("qr-code", fmt.Sprintf("encode %d chars", len(text)))
	}
	return &QRResult{
		DataURI: "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()),
		Size:    size,
	}, nil
}

func toRGBA(c color.Color) color.RGBA {
	r, g, b, a := c.RGBA()
	return color.RGBA{uint8(r >> 8), uint8(g >> 8), uint8(b >> 8), uint8(a >> 8)}
}

// overlayLogo centres a scaled logo on a white plate, so the surrounding
// modules stay readable even against a transparent logo.
func overlayLogo(base image.Image, logoPath string) (image.Image, error) {
	logo, err := decodeImage(logoPath)
	if err != nil {
		return nil, err
	}
	b := base.Bounds()
	out := image.NewRGBA(b)
	draw.Draw(out, b, base, b.Min, draw.Src)

	side := b.Dx() * 22 / 100
	pad := side / 8
	cx, cy := b.Dx()/2, b.Dy()/2
	plate := image.Rect(cx-side/2-pad, cy-side/2-pad, cx+side/2+pad, cy+side/2+pad)
	draw.Draw(out, plate, image.NewUniform(color.White), image.Point{}, draw.Src)

	target := image.Rect(cx-side/2, cy-side/2, cx+side/2, cy+side/2)
	draw.CatmullRom.Scale(out, target, logo, squareCrop(logo.Bounds()), draw.Over, nil)
	return out, nil
}

// EncodeToFile writes the QR straight to disk, for when the user wants a file
// rather than something to copy.
func (q *QRService) EncodeToFile(text string, outDir string, size int, level string, fg, bg, logoPath string) (*PDFResult, error) {
	res, err := q.Encode(text, size, level, fg, bg, logoPath)
	if err != nil {
		return nil, err
	}
	if res.Error != "" {
		return &PDFResult{Success: false, Error: res.Error}, nil
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(res.DataURI, "data:image/png;base64,"))
	if err != nil {
		return nil, err
	}
	out := UniqueOutputPath(outDir, "qrcode", ".png")
	if err := os.WriteFile(out, raw, 0o644); err != nil {
		return nil, err
	}
	return &PDFResult{
		Success: true, OutputPath: out, OutputDir: outDir,
		OutputFiles: []string{out}, OutputSize: int64(len(raw)),
	}, nil
}

type QRDecoded struct {
	Path   string `json:"path"`
	Name   string `json:"name"`
	Text   string `json:"text"`
	Format string `json:"format"`
	Error  string `json:"error,omitempty"`
}

// Decode reads codes out of image files. gozxing handles QR plus the common
// 1D symbologies, so a scanned barcode works too.
func (q *QRService) Decode(paths []string) ([]QRDecoded, error) {
	out := make([]QRDecoded, 0, len(paths))
	for _, p := range paths {
		d := QRDecoded{Path: p, Name: filepath.Base(p)}
		img, err := decodeImage(p)
		if err != nil {
			d.Error = err.Error()
			out = append(out, d)
			continue
		}
		bmp, err := gozxing.NewBinaryBitmapFromImage(img)
		if err != nil {
			d.Error = err.Error()
			out = append(out, d)
			continue
		}
		result, err := zxqr.NewQRCodeReader().Decode(bmp, nil)
		if err != nil {
			d.Error = "no code found"
		} else {
			d.Text = result.GetText()
			d.Format = result.GetBarcodeFormat().String()
		}
		out = append(out, d)
	}
	if q.store != nil && len(out) > 0 {
		_ = q.store.AddHistory("qr-code", fmt.Sprintf("decode %d images", len(out)))
	}
	return out, nil
}
