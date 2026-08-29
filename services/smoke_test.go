package services

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

// minimalPDF builds a valid single-page PDF with a correct xref table.
func minimalPDF() []byte {
	var buf bytes.Buffer
	offsets := make([]int, 0, 5)
	write := func(s string) { buf.WriteString(s) }
	obj := func(body string) {
		offsets = append(offsets, buf.Len())
		write(body)
	}
	write("%PDF-1.4\n")
	obj("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
	obj("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")
	obj("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>\nendobj\n")
	stream := "BT 100 700 Td ET\n"
	obj(fmt.Sprintf("4 0 obj\n<< /Length %d >>\nstream\n%sendstream\nendobj\n", len(stream), stream))
	xrefPos := buf.Len()
	write(fmt.Sprintf("xref\n0 %d\n", len(offsets)+1))
	write("0000000000 65535 f \n")
	for _, off := range offsets {
		write(fmt.Sprintf("%010d 00000 n \n", off))
	}
	write(fmt.Sprintf("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(offsets)+1, xrefPos))
	return buf.Bytes()
}

func writeTempPDF(t *testing.T, dir, name string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, minimalPDF(), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestPDFServiceSmoke(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out")
	svc := NewPDFService(nil)

	a := writeTempPDF(t, dir, "a.pdf")
	b := writeTempPDF(t, dir, "b.pdf")

	// Merge
	res, err := svc.Merge([]string{a, b}, out)
	if err != nil {
		t.Fatalf("merge error: %v", err)
	}
	if !res.Success {
		t.Fatalf("merge failed: %s", res.Error)
	}
	if n, err := svc.PageCount(res.OutputPath); err != nil || n != 2 {
		t.Fatalf("merged page count = %d, err = %v", n, err)
	}

	// Split (each page)
	sres, err := svc.Split(res.OutputPath, out, "each", 0, "")
	if err != nil {
		t.Fatalf("split error: %v", err)
	}
	if !sres.Success || len(sres.OutputFiles) != 2 {
		t.Fatalf("split failed: %+v", sres)
	}

	// Rotate
	rres, err := svc.Rotate(a, out, 90, "")
	if err != nil || !rres.Success {
		t.Fatalf("rotate: err=%v res=%+v", err, rres)
	}

	// Encrypt then decrypt round-trip
	eres, err := svc.Encrypt(a, out, "secret123", "")
	if err != nil || !eres.Success {
		t.Fatalf("encrypt: err=%v res=%+v", err, eres)
	}
	dres, err := svc.Decrypt(eres.OutputPath, out, "secret123")
	if err != nil || !dres.Success {
		t.Fatalf("decrypt: err=%v res=%+v", err, dres)
	}

	// Compress
	cres, err := svc.Compress(a, out)
	if err != nil || !cres.Success {
		t.Fatalf("compress: err=%v res=%+v", err, cres)
	}
}

func writeTempPNG(t *testing.T, dir, name string) string {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 64, 48))
	for y := 0; y < 48; y++ {
		for x := 0; x < 64; x++ {
			img.Set(x, y, color.RGBA{uint8(x * 4), uint8(y * 5), 200, 255})
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

func TestImageServiceSmoke(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out")
	svc := NewImageService(nil)
	src := writeTempPNG(t, dir, "src.png")

	for _, format := range []string{"JPG", "WEBP", "BMP", "GIF", "PNG"} {
		res, err := svc.ConvertBatch([]string{src}, out, format)
		if err != nil {
			t.Fatalf("convert %s error: %v", format, err)
		}
		if res.SuccessCount != 1 {
			t.Fatalf("convert %s failed: %+v", format, res.Errors)
		}
	}

	cres, err := svc.CompressBatch([]string{src}, out, "medium")
	if err != nil || cres.SuccessCount != 1 {
		t.Fatalf("compress: err=%v res=%+v", err, cres)
	}

	ires, err := svc.GenerateIcons(src, out, []int{16, 32, 256}, true, true)
	if err != nil || !ires.Success {
		t.Fatalf("icons: err=%v res=%+v", err, ires)
	}
	// expect 3 PNGs + icon.ico + icon.icns
	if len(ires.Files) < 4 {
		t.Fatalf("icons produced too few files: %v", ires.Files)
	}
	hasICO := false
	for _, f := range ires.Files {
		if filepath.Ext(f) == ".ico" {
			hasICO = true
			// PNG-ICO container sanity: starts with ICONDIR reserved+type
			data, _ := os.ReadFile(f)
			if len(data) < 6 || data[0] != 0 || data[2] != 1 {
				t.Fatalf("bad ICO header: % x", data[:6])
			}
		}
	}
	if !hasICO {
		t.Fatal("no ICO produced")
	}
}

func TestStoreServiceSmoke(t *testing.T) {
	// Keeps the test off the real user database.
	t.Setenv("HITOOL_DATA_DIR", t.TempDir())
	home := os.Getenv("HOME")
	if home == "" {
		t.Skip("no HOME")
	}
	s := NewStoreService()

	if err := s.SetSetting("theme", "dark"); err != nil {
		t.Fatalf("set: %v", err)
	}
	v, err := s.GetSetting("theme")
	if err != nil || v != "dark" {
		t.Fatalf("get = %q, err = %v", v, err)
	}
	if v, err := s.GetSetting("never-written"); err != nil || v != "" {
		t.Fatalf("missing key should read as empty, got %q err %v", v, err)
	}

	// Favorites toggle on then off.
	on, err := s.ToggleFavorite("pdf-merge")
	if err != nil || !on {
		t.Fatalf("toggle on = %v, err = %v", on, err)
	}
	favs, err := s.GetFavorites()
	if err != nil || len(favs) != 1 || favs[0] != "pdf-merge" {
		t.Fatalf("favorites = %v, err = %v", favs, err)
	}
	if on, err := s.ToggleFavorite("pdf-merge"); err != nil || on {
		t.Fatalf("toggle off = %v, err = %v", on, err)
	}

	// History records and clears.
	if err := s.AddHistory("image-convert", "3 -> PNG"); err != nil {
		t.Fatal(err)
	}
	hist, err := s.GetHistory(10)
	if err != nil || len(hist) != 1 || hist[0].Tool != "image-convert" {
		t.Fatalf("history = %+v, err = %v", hist, err)
	}
	if err := s.ClearHistory(); err != nil {
		t.Fatal(err)
	}
}
