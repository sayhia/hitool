package services

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

// solidMark builds an opaque red PNG to stamp with — a flat colour makes it
// trivial to assert where the mark did and did not land.
func solidMark(t *testing.T, w, h int) string {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{255, 0, 0, 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
}

// writeWhite makes a pure-white canvas, so any red is unambiguously the mark.
func writeWhite(t *testing.T, dir, name string, w, h int) string {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{255, 255, 255, 255})
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

func readPNG(t *testing.T, path string) image.Image {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	img, err := png.Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	return img
}

// reddishAt reports whether a pixel has been touched by the red mark.
func reddishAt(img image.Image, x, y int) bool {
	r, g, b, _ := img.At(x, y).RGBA()
	return r>>8 > 200 && g>>8 < 220 && b>>8 < 220
}

func TestAnchorRectPlacement(t *testing.T) {
	const pw, ph, mw, mh, margin = 100, 100, 20, 10, 5
	cases := []struct {
		anchor string
		want   image.Rectangle
	}{
		{"tl", image.Rect(5, 5, 25, 15)},
		{"tc", image.Rect(40, 5, 60, 15)},
		{"tr", image.Rect(75, 5, 95, 15)},
		{"ml", image.Rect(5, 45, 25, 55)},
		{"mc", image.Rect(40, 45, 60, 55)},
		{"mr", image.Rect(75, 45, 95, 55)},
		{"bl", image.Rect(5, 85, 25, 95)},
		{"bc", image.Rect(40, 85, 60, 95)},
		{"br", image.Rect(75, 85, 95, 95)},
		{"", image.Rect(75, 85, 95, 95)}, // unknown falls back to br
	}
	for _, c := range cases {
		if got := anchorRect(c.anchor, pw, ph, mw, mh, margin); got != c.want {
			t.Errorf("anchorRect(%q) = %v, want %v", c.anchor, got, c.want)
		}
	}
}

func TestWatermarkLandsAtTheRequestedCorner(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out")
	src := writeWhite(t, dir, "page.png", 400, 400)
	mark := solidMark(t, 40, 40)

	res, err := (&ImageService{}).WatermarkBatch(
		[]string{src}, out, mark, "tl", 25, 100, 5, false, 100,
	)
	if err != nil {
		t.Fatal(err)
	}
	if res.SuccessCount != 1 {
		t.Fatalf("result = %+v", res)
	}

	entries, _ := os.ReadDir(out)
	if len(entries) != 1 {
		t.Fatalf("want one output, got %d", len(entries))
	}
	img := readPNG(t, filepath.Join(out, entries[0].Name()))

	// 25% of 400 = 100px mark at a 20px margin: (20,20)–(120,120).
	if !reddishAt(img, 60, 60) {
		t.Error("top-left region was not marked")
	}
	if reddishAt(img, 350, 350) {
		t.Error("the opposite corner was marked too")
	}
}

func TestWatermarkOpacityBlendsRatherThanReplaces(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out")
	src := writeWhite(t, dir, "page.png", 200, 200)
	mark := solidMark(t, 40, 40)

	if _, err := (&ImageService{}).WatermarkBatch(
		[]string{src}, out, mark, "mc", 50, 30, 0, false, 100,
	); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(out)
	img := readPNG(t, filepath.Join(out, entries[0].Name()))

	// Dead centre is inside the mark; at 30% over white it must be pink,
	// not the mark's pure red.
	r, g, b, _ := img.At(100, 100).RGBA()
	if r>>8 != 255 {
		t.Errorf("red channel = %d, want saturated", r>>8)
	}
	if g>>8 < 100 || g>>8 > 220 {
		t.Errorf("green = %d — 30%% red over white should sit around 178", g>>8)
	}
	if g != b {
		t.Errorf("green (%d) and blue (%d) should match on a grey base", g>>8, b>>8)
	}
}

func TestWatermarkTilingCoversTheWholeImage(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out")
	src := writeWhite(t, dir, "page.png", 300, 300)
	mark := solidMark(t, 20, 20)

	if _, err := (&ImageService{}).WatermarkBatch(
		[]string{src}, out, mark, "mc", 15, 100, 0, true, 100,
	); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(out)
	img := readPNG(t, filepath.Join(out, entries[0].Name()))

	// A tiled mark must appear in every quadrant, unlike an anchored one.
	quadrants := [][2]int{{40, 40}, {260, 40}, {40, 260}, {260, 260}}
	hits := 0
	for _, q := range quadrants {
		// Sample a small neighbourhood — the tile grid may not land exactly
		// on the probe point.
		found := false
		for dy := -20; dy <= 20 && !found; dy++ {
			for dx := -20; dx <= 20 && !found; dx++ {
				if reddishAt(img, q[0]+dx, q[1]+dy) {
					found = true
				}
			}
		}
		if found {
			hits++
		}
	}
	if hits != 4 {
		t.Errorf("tiling reached %d of 4 quadrants", hits)
	}
}

func TestWatermarkScalesRelativeToTheShorterSide(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out")
	// A wide banner: the mark should be sized off the 100px height.
	src := writeWhite(t, dir, "wide.png", 600, 100)
	mark := solidMark(t, 10, 10)

	if _, err := (&ImageService{}).WatermarkBatch(
		[]string{src}, out, mark, "tl", 50, 100, 0, false, 100,
	); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(out)
	img := readPNG(t, filepath.Join(out, entries[0].Name()))

	// 50% of the shorter side (100) = 50px, so (0,0)–(50,50) is marked
	// and x=200 is not. Had it used the longer side it would be 300px wide.
	if !reddishAt(img, 25, 25) {
		t.Error("the mark is missing entirely")
	}
	if reddishAt(img, 200, 50) {
		t.Error("the mark was sized off the longer side")
	}
}

func TestWatermarkRejectsBadMarkInput(t *testing.T) {
	dir := t.TempDir()
	src := writeWhite(t, dir, "page.png", 50, 50)
	svc := &ImageService{}

	if _, err := svc.WatermarkBatch([]string{src}, dir, "", "br", 25, 60, 3, false, 90); err == nil {
		t.Error("an empty watermark should be refused")
	}
	if _, err := svc.WatermarkBatch([]string{src}, dir, "not base64!!", "br", 25, 60, 3, false, 90); err == nil {
		t.Error("malformed base64 should be refused")
	}
	valid := base64.StdEncoding.EncodeToString([]byte("this is not a png"))
	if _, err := svc.WatermarkBatch([]string{src}, dir, valid, "br", 25, 60, 3, false, 90); err == nil {
		t.Error("valid base64 that is not a PNG should be refused")
	}
}

func TestWatermarkReportsBadFileWithoutAbortingTheBatch(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out")
	good := writeWhite(t, dir, "good.png", 100, 100)
	bad := filepath.Join(dir, "broken.png")
	if err := os.WriteFile(bad, []byte("not an image"), 0o644); err != nil {
		t.Fatal(err)
	}

	res, err := (&ImageService{}).WatermarkBatch(
		[]string{bad, good}, out, solidMark(t, 10, 10), "br", 25, 60, 3, false, 90,
	)
	if err != nil {
		t.Fatalf("one bad file must not fail the batch: %v", err)
	}
	if res.SuccessCount != 1 || res.FailCount != 1 {
		t.Errorf("result = %+v", res)
	}
	if len(res.Errors) != 1 {
		t.Errorf("errors = %v", res.Errors)
	}
}

func TestWatermarkClampsOutOfRangeSettings(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out")
	src := writeWhite(t, dir, "page.png", 200, 200)

	// Absurd values must be clamped, not crash or produce a blank file.
	res, err := (&ImageService{}).WatermarkBatch(
		[]string{src}, out, solidMark(t, 10, 10), "mc", 9999, 9999, 9999, false, 9999,
	)
	if err != nil {
		t.Fatal(err)
	}
	if res.SuccessCount != 1 {
		t.Fatalf("result = %+v", res)
	}
	entries, _ := os.ReadDir(out)
	img := readPNG(t, filepath.Join(out, entries[0].Name()))
	if img.Bounds().Dx() != 200 || img.Bounds().Dy() != 200 {
		t.Errorf("output geometry changed: %v", img.Bounds())
	}
}

func TestAnchorsListMatchesWhatAnchorRectHandles(t *testing.T) {
	for _, a := range (&ImageService{}).Anchors() {
		r := anchorRect(a, 100, 100, 20, 20, 5)
		fallback := anchorRect("nonsense-anchor", 100, 100, 20, 20, 5)
		if a != "br" && r == fallback {
			t.Errorf("anchor %q is offered but falls through to the default", a)
		}
	}
}
