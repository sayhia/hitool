package services

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func writeImage(t *testing.T, dir, name string, w, h int) string {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{uint8(x % 256), uint8(y % 256), 128, 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestResizeTargetGeometry(t *testing.T) {
	// A 400×200 landscape source.
	src := image.Rect(0, 0, 400, 200)

	cases := []struct {
		name       string
		mode       ResizeMode
		w, h       int
		wantW      int
		wantH      int
		wantSample image.Rectangle
	}{
		{"fit keeps aspect", "fit", 200, 200, 200, 100, src},
		{"fit uses the limiting axis", "fit", 800, 50, 100, 50, src},
		{"fit never enlarges", "fit", 4000, 4000, 400, 200, src},
		{"fit with only a width", "fit", 100, 0, 100, 50, src},
		{"fit with only a height", "fit", 0, 100, 200, 100, src},
		{"exact stretches", "exact", 123, 456, 123, 456, src},
		{"percent scales both axes", "percent", 50, 0, 200, 100, src},
		{"percent can enlarge", "percent", 200, 0, 800, 400, src},
		{"longEdge uses the wider side", "longEdge", 100, 0, 100, 50, src},
		// fill crops the source to the target ratio, centred: a 1:1 target
		// takes the middle 200×200 of the 400×200 source.
		{"fill crops to the target ratio", "fill", 100, 100, 100, 100, image.Rect(100, 0, 300, 200)},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			dst, sample := resizeTarget(src, c.mode, c.w, c.h)
			if dst.Dx() != c.wantW || dst.Dy() != c.wantH {
				t.Errorf("size = %dx%d, want %dx%d", dst.Dx(), dst.Dy(), c.wantW, c.wantH)
			}
			if sample != c.wantSample {
				t.Errorf("sample = %v, want %v", sample, c.wantSample)
			}
		})
	}
}

func TestResizeTargetHandlesPortraitAndDegenerate(t *testing.T) {
	portrait := image.Rect(0, 0, 200, 400)
	dst, _ := resizeTarget(portrait, "longEdge", 100, 0)
	if dst.Dx() != 50 || dst.Dy() != 100 {
		t.Errorf("portrait longEdge = %dx%d, want 50x100", dst.Dx(), dst.Dy())
	}

	// A zero-sized source must not divide by zero.
	dst, _ = resizeTarget(image.Rect(0, 0, 0, 0), "fit", 100, 100)
	if dst.Dx() < 1 || dst.Dy() < 1 {
		t.Errorf("degenerate source produced %v", dst)
	}

	// Never produce a zero dimension, however small the request.
	dst, _ = resizeTarget(image.Rect(0, 0, 1000, 10), "fit", 1, 1)
	if dst.Dx() < 1 || dst.Dy() < 1 {
		t.Errorf("extreme downscale produced %v", dst)
	}
}

func TestResizeBatchWritesExpectedPixels(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out")
	src := writeImage(t, dir, "a.png", 400, 200)

	svc := NewImageService(nil)
	res, err := svc.ResizeBatch([]string{src}, out, "fit", 100, 100, 90, "")
	if err != nil {
		t.Fatal(err)
	}
	if res.SuccessCount != 1 {
		t.Fatalf("resize failed: %v", res.Errors)
	}

	infos := svc.ProbeImages([]string{filepath.Join(out, "a.png")})
	if infos[0].Error != "" {
		t.Fatalf("probe: %s", infos[0].Error)
	}
	if infos[0].Width != 100 || infos[0].Height != 50 {
		t.Errorf("output = %dx%d, want 100x50", infos[0].Width, infos[0].Height)
	}
}

func TestResizeBatchCanChangeFormat(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out")
	src := writeImage(t, dir, "a.png", 60, 40)

	svc := NewImageService(nil)
	res, err := svc.ResizeBatch([]string{src}, out, "exact", 30, 20, 80, "JPG")
	if err != nil || res.SuccessCount != 1 {
		t.Fatalf("resize: err=%v res=%+v", err, res)
	}
	if _, err := os.Stat(filepath.Join(out, "a.jpg")); err != nil {
		t.Errorf("expected a .jpg output: %v", err)
	}
}

func TestResizeBatchReportsBadInputWithoutAborting(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out")
	good := writeImage(t, dir, "good.png", 40, 40)
	bad := filepath.Join(dir, "bad.png")
	if err := os.WriteFile(bad, []byte("not an image"), 0o644); err != nil {
		t.Fatal(err)
	}

	res, err := NewImageService(nil).ResizeBatch([]string{bad, good}, out, "fit", 20, 20, 90, "")
	if err != nil {
		t.Fatal(err)
	}
	if res.SuccessCount != 1 || res.FailCount != 1 {
		t.Errorf("counts = %d ok / %d fail, want 1/1", res.SuccessCount, res.FailCount)
	}
	if len(res.Errors) != 1 {
		t.Errorf("expected one recorded error, got %v", res.Errors)
	}
}

func TestProbeImages(t *testing.T) {
	dir := t.TempDir()
	p := writeImage(t, dir, "a.png", 123, 45)

	infos := NewImageService(nil).ProbeImages([]string{p, filepath.Join(dir, "nope.png")})
	if len(infos) != 2 {
		t.Fatalf("expected 2 results, got %d", len(infos))
	}
	if infos[0].Width != 123 || infos[0].Height != 45 || infos[0].Format != "png" {
		t.Errorf("probe = %+v", infos[0])
	}
	if infos[1].Error == "" {
		t.Error("expected an error for the missing file")
	}
}

func TestFromImagesBuildsAPdf(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out")
	a := writeImage(t, dir, "a.png", 200, 100)
	b := writeImage(t, dir, "b.png", 100, 200)

	svc := NewPDFService(nil)
	res, err := svc.FromImages([]string{a, b}, out, "A4", false)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Success {
		t.Fatalf("FromImages failed: %s", res.Error)
	}
	n, err := svc.PageCount(res.OutputPath)
	if err != nil {
		t.Fatalf("the produced file is not a readable PDF: %v", err)
	}
	if n != 2 {
		t.Errorf("page count = %d, want 2 (one per image)", n)
	}
}

func TestFromImagesAutoSizeAndValidation(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out")
	a := writeImage(t, dir, "a.png", 300, 150)

	svc := NewPDFService(nil)
	res, err := svc.FromImages([]string{a}, out, "auto", false)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Success {
		t.Fatalf("auto page size failed: %s", res.Error)
	}
	if n, err := svc.PageCount(res.OutputPath); err != nil || n != 1 {
		t.Errorf("page count = %d, err = %v", n, err)
	}

	if _, err := svc.FromImages(nil, out, "A4", false); err == nil {
		t.Error("expected an error when no images are given")
	}

	if r, _ := svc.FromImages([]string{a}, out, "NotAPaperSize", false); r.Success {
		t.Error("expected an unknown paper size to be rejected")
	}
}

func TestPageSizesIncludesAuto(t *testing.T) {
	sizes := NewPDFService(nil).PageSizes()
	if len(sizes) == 0 || sizes[0] != "auto" {
		t.Errorf("PageSizes should lead with auto, got %v", sizes)
	}
}
