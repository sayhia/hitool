package services

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// decodeDataURI turns an Encode result back into an image, so a test can check
// what was actually produced rather than that a call returned without error.
func decodeDataURI(t *testing.T, uri string) image.Image {
	t.Helper()
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(uri, "data:image/png;base64,"))
	if err != nil {
		t.Fatalf("data URI is not base64: %v", err)
	}
	img, err := png.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("data URI is not a PNG: %v", err)
	}
	return img
}

func TestQREncodeDecodeRoundTrip(t *testing.T) {
	dir := t.TempDir()
	svc := NewQRService(nil)

	// A payload with CJK and a URL — the two things people actually encode.
	const payload = "https://example.com/搜索?q=茶叶&n=1"

	res, err := svc.Encode(payload, 512, "high", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if res.Error != "" {
		t.Fatal(res.Error)
	}

	img := decodeDataURI(t, res.DataURI)
	if img.Bounds().Dx() < 512 {
		t.Errorf("image is %dpx wide, asked for 512", img.Bounds().Dx())
	}

	// Write it out and read it back through the decoder.
	raw, _ := base64.StdEncoding.DecodeString(strings.TrimPrefix(res.DataURI, "data:image/png;base64,"))
	p := filepath.Join(dir, "code.png")
	if err := os.WriteFile(p, raw, 0o644); err != nil {
		t.Fatal(err)
	}

	out, err := svc.Decode([]string{p})
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 {
		t.Fatalf("want 1 result, got %d", len(out))
	}
	if out[0].Error != "" {
		t.Fatalf("decode failed: %s", out[0].Error)
	}
	if out[0].Text != payload {
		t.Errorf("round trip changed the payload:\n got %q\nwant %q", out[0].Text, payload)
	}
	if out[0].Format != "QR_CODE" {
		t.Errorf("format = %q", out[0].Format)
	}
}

func TestQREncodeRejectsEmptyInput(t *testing.T) {
	res, err := NewQRService(nil).Encode("   ", 512, "medium", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if res.Error == "" {
		t.Error("blank input should be reported, not encoded")
	}
	if res.DataURI != "" {
		t.Error("a rejected encode must not return an image")
	}
}

func TestQREncodeClampsAbsurdSizes(t *testing.T) {
	svc := NewQRService(nil)
	for _, size := range []int{0, -10, 999999} {
		res, err := svc.Encode("hello", size, "medium", "", "", "")
		if err != nil || res.Error != "" {
			t.Fatalf("size %d: %v %s", size, err, res.Error)
		}
		img := decodeDataURI(t, res.DataURI)
		if w := img.Bounds().Dx(); w < 64 || w > 4096 {
			t.Errorf("size %d produced a %dpx image", size, w)
		}
	}
}

func TestQRCustomColoursSurviveToThePixels(t *testing.T) {
	res, err := NewQRService(nil).Encode("colour", 256, "medium", "#204090", "#f0e8d0", "")
	if err != nil || res.Error != "" {
		t.Fatalf("%v %s", err, res.Error)
	}
	img := decodeDataURI(t, res.DataURI)

	// The very corner of a QR is quiet zone, i.e. background.
	r, g, b, _ := img.At(img.Bounds().Min.X+1, img.Bounds().Min.Y+1).RGBA()
	if uint8(r>>8) != 0xf0 || uint8(g>>8) != 0xe8 || uint8(b>>8) != 0xd0 {
		t.Errorf("background = #%02x%02x%02x, want #f0e8d0", r>>8, g>>8, b>>8)
	}
}

func TestParseHexColor(t *testing.T) {
	cases := []struct {
		in   string
		want color.RGBA
	}{
		{"#ff0000", color.RGBA{255, 0, 0, 255}},
		{"00ff00", color.RGBA{0, 255, 0, 255}},
		{"#f00", color.RGBA{255, 0, 0, 255}},
		{"  #0000FF  ", color.RGBA{0, 0, 255, 255}},
	}
	for _, c := range cases {
		if got := toRGBA(parseHexColor(c.in, color.Black)); got != c.want {
			t.Errorf("parseHexColor(%q) = %v, want %v", c.in, got, c.want)
		}
	}

	// Garbage must fall back rather than produce a surprise colour.
	for _, bad := range []string{"", "#12", "nonsense", "#gggggg"} {
		if got := toRGBA(parseHexColor(bad, color.White)); got != (color.RGBA{255, 255, 255, 255}) {
			t.Errorf("parseHexColor(%q) = %v, want the fallback", bad, got)
		}
	}
}

func TestQRDecodeReportsPerFileWithoutAborting(t *testing.T) {
	dir := t.TempDir()
	svc := NewQRService(nil)

	// A plain image with no code in it, plus a path that does not exist.
	plain := writeImage(t, dir, "plain.png", 64, 64)
	missing := filepath.Join(dir, "nope.png")

	res, err := svc.Encode("real", 256, "medium", "", "", "")
	if err != nil || res.Error != "" {
		t.Fatal(err)
	}
	raw, _ := base64.StdEncoding.DecodeString(strings.TrimPrefix(res.DataURI, "data:image/png;base64,"))
	good := filepath.Join(dir, "good.png")
	if err := os.WriteFile(good, raw, 0o644); err != nil {
		t.Fatal(err)
	}

	out, err := svc.Decode([]string{plain, missing, good})
	if err != nil {
		t.Fatalf("one bad file must not fail the batch: %v", err)
	}
	if len(out) != 3 {
		t.Fatalf("want a row per input, got %d", len(out))
	}
	if out[0].Error == "" {
		t.Error("an image with no code should report an error")
	}
	if out[1].Error == "" {
		t.Error("a missing file should report an error")
	}
	if out[2].Text != "real" {
		t.Errorf("the good file decoded as %q", out[2].Text)
	}
}

func TestQREncodeToFileWritesAReadableCode(t *testing.T) {
	dir := t.TempDir()
	svc := NewQRService(nil)

	res, err := svc.EncodeToFile("written to disk", dir, 320, "medium", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if !res.Success {
		t.Fatalf("write failed: %s", res.Error)
	}
	if res.OutputSize == 0 {
		t.Error("reported size is zero")
	}

	back, err := svc.Decode([]string{res.OutputPath})
	if err != nil || back[0].Text != "written to disk" {
		t.Errorf("file did not round trip: %v %+v", err, back[0])
	}
}

func TestQRLogoDoesNotBreakDecoding(t *testing.T) {
	dir := t.TempDir()
	svc := NewQRService(nil)
	logo := writeImage(t, dir, "logo.png", 100, 100)

	// "highest" recovery is what makes a centre overlay survivable.
	res, err := svc.Encode("logo payload 12345", 640, "highest", "", "", logo)
	if err != nil || res.Error != "" {
		t.Fatalf("%v %s", err, res.Error)
	}
	raw, _ := base64.StdEncoding.DecodeString(strings.TrimPrefix(res.DataURI, "data:image/png;base64,"))
	p := filepath.Join(dir, "logo-code.png")
	if err := os.WriteFile(p, raw, 0o644); err != nil {
		t.Fatal(err)
	}

	back, err := svc.Decode([]string{p})
	if err != nil {
		t.Fatal(err)
	}
	if back[0].Text != "logo payload 12345" {
		t.Errorf("a logo at 22%% broke the code: %q (%s)", back[0].Text, back[0].Error)
	}
}

func TestQRLogoErrorIsReportedNotPanicked(t *testing.T) {
	res, err := NewQRService(nil).Encode("x", 256, "medium", "", "", "/no/such/logo.png")
	if err != nil {
		t.Fatal(err)
	}
	if res.Error == "" {
		t.Error("an unreadable logo should be reported")
	}
}

func TestQRLevels(t *testing.T) {
	levels := NewQRService(nil).Levels()
	if len(levels) != 4 {
		t.Fatalf("levels = %v", levels)
	}
	for _, l := range levels {
		if _, ok := qrLevels[l]; !ok {
			t.Errorf("%q is offered but not mapped", l)
		}
	}
}
