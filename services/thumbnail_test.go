package services

import (
	"encoding/base64"
	"image"
	"image/jpeg"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func decodeThumb(t *testing.T, dataURL string) image.Image {
	t.Helper()
	raw, ok := strings.CutPrefix(dataURL, "data:image/jpeg;base64,")
	if !ok {
		t.Fatalf("not a jpeg data URL: %.40q", dataURL)
	}
	b, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		t.Fatal(err)
	}
	img, err := jpeg.Decode(strings.NewReader(string(b)))
	if err != nil {
		t.Fatal(err)
	}
	return img
}

func TestThumbnailScalesDown(t *testing.T) {
	svc := NewImageService(nil)
	dir := t.TempDir()
	p := writeImage(t, dir, "big.png", 800, 400)

	url, err := svc.Thumbnail(p, 96)
	if err != nil {
		t.Fatal(err)
	}
	img := decodeThumb(t, url)
	b := img.Bounds()
	if b.Dx() != 96 || b.Dy() != 48 {
		t.Fatalf("want 96x48, got %dx%d", b.Dx(), b.Dy())
	}
}

func TestThumbnailNeverEnlarges(t *testing.T) {
	svc := NewImageService(nil)
	dir := t.TempDir()
	p := writeImage(t, dir, "small.png", 20, 10)

	url, err := svc.Thumbnail(p, 96)
	if err != nil {
		t.Fatal(err)
	}
	img := decodeThumb(t, url)
	if got := img.Bounds().Dx(); got != 20 {
		t.Fatalf("want width 20, got %d", got)
	}
}

func TestThumbnailSkipsHugeFiles(t *testing.T) {
	svc := NewImageService(nil)
	dir := t.TempDir()
	p := writeImage(t, dir, "huge.png", 4, 4)
	// Stretch the file past the 8 MB guard without writing real pixels —
	// the size check must fire before any decode is attempted.
	if err := os.Truncate(p, 8<<20+1); err != nil {
		t.Fatal(err)
	}

	url, err := svc.Thumbnail(p, 96)
	if err != nil || url != "" {
		t.Fatalf("want skipped (\"\", nil), got (%q, %v)", url, err)
	}
}

func TestThumbnailMissingFile(t *testing.T) {
	svc := NewImageService(nil)
	if _, err := svc.Thumbnail(filepath.Join(t.TempDir(), "nope.png"), 96); err == nil {
		t.Fatal("want an error for a missing file")
	}
}

func TestThumbnailClampsMax(t *testing.T) {
	svc := NewImageService(nil)
	dir := t.TempDir()
	p := writeImage(t, dir, "wide.png", 4000, 100)

	url, err := svc.Thumbnail(p, 0) // bogus max falls back to 96
	if err != nil {
		t.Fatal(err)
	}
	if got := decodeThumb(t, url).Bounds().Dx(); got != 96 {
		t.Fatalf("want clamped width 96, got %d", got)
	}
}
