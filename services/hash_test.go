package services

import (
	"encoding/base64"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Known-answer tests: these digests are published constants, so a regression
// in the streaming reader shows up immediately rather than as "some hash".
const (
	emptySHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
	abcMD5      = "900150983cd24fb0d6963f7d28e17f72"
	abcSHA1     = "a9993e364706816aba3e25717850c26c9cd0d89d"
	abcSHA256   = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
)

func TestHashTextKnownAnswers(t *testing.T) {
	h := NewHashService(nil)

	got, err := h.HashText("abc", []string{"md5", "sha1", "sha256"})
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"md5": abcMD5, "sha1": abcSHA1, "sha256": abcSHA256}
	if len(got) != 3 {
		t.Fatalf("expected 3 digests, got %d", len(got))
	}
	for _, d := range got {
		if d.Hex != want[d.Algo] {
			t.Errorf("%s = %s, want %s", d.Algo, d.Hex, want[d.Algo])
		}
		// The base64 form must decode back to the same bytes as the hex form.
		raw, err := base64.StdEncoding.DecodeString(d.Base64)
		if err != nil {
			t.Errorf("%s: base64 not decodable: %v", d.Algo, err)
			continue
		}
		if hex.EncodeToString(raw) != d.Hex {
			t.Errorf("%s: base64 and hex disagree", d.Algo)
		}
	}
}

func TestHashTextEmptyAndDefaults(t *testing.T) {
	h := NewHashService(nil)

	got, err := h.HashText("", []string{"sha256"})
	if err != nil {
		t.Fatal(err)
	}
	if got[0].Hex != emptySHA256 {
		t.Errorf("empty sha256 = %s", got[0].Hex)
	}

	// No algorithms requested means "all of them".
	all, err := h.HashText("x", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != len(h.Algorithms()) {
		t.Errorf("default set produced %d digests, want %d", len(all), len(h.Algorithms()))
	}
}

func TestHashTextRejectsUnknownAlgorithm(t *testing.T) {
	if _, err := NewHashService(nil).HashText("x", []string{"sha3"}); err == nil {
		t.Fatal("expected an error for an unsupported algorithm")
	}
}

func TestHashFilesMatchesTextDigest(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "a.txt")
	if err := os.WriteFile(p, []byte("abc"), 0o644); err != nil {
		t.Fatal(err)
	}

	h := NewHashService(nil)
	res, err := h.HashFiles([]string{p}, []string{"md5", "sha256"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(res) != 1 || res[0].Error != "" {
		t.Fatalf("unexpected result: %+v", res)
	}
	if res[0].Size != 3 {
		t.Errorf("size = %d, want 3", res[0].Size)
	}
	byAlgo := map[string]string{}
	for _, d := range res[0].Digests {
		byAlgo[d.Algo] = d.Hex
	}
	if byAlgo["md5"] != abcMD5 || byAlgo["sha256"] != abcSHA256 {
		t.Errorf("file digests disagree with the known answers: %+v", byAlgo)
	}
}

func TestHashFilesStreamsLargeInput(t *testing.T) {
	// Larger than the 1MB read buffer, to exercise the multi-chunk path.
	dir := t.TempDir()
	p := filepath.Join(dir, "big.bin")
	blob := strings.Repeat("a", 3*1024*1024+17)
	if err := os.WriteFile(p, []byte(blob), 0o644); err != nil {
		t.Fatal(err)
	}

	h := NewHashService(nil)
	fileRes, err := h.HashFiles([]string{p}, []string{"sha256"}, "")
	if err != nil {
		t.Fatal(err)
	}
	textRes, err := h.HashText(blob, []string{"sha256"})
	if err != nil {
		t.Fatal(err)
	}
	if fileRes[0].Digests[0].Hex != textRes[0].Hex {
		t.Error("streamed file digest differs from the in-memory digest")
	}
}

func TestHashFilesComparesAgainstExpected(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "a.txt")
	if err := os.WriteFile(p, []byte("abc"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := NewHashService(nil)

	// Case-insensitive hex match.
	res, _ := h.HashFiles([]string{p}, []string{"sha256"}, strings.ToUpper(abcSHA256))
	if !res[0].Compared || !res[0].Matched {
		t.Errorf("expected an uppercase hex digest to match: %+v", res[0])
	}

	// A wrong value compares but does not match.
	res, _ = h.HashFiles([]string{p}, []string{"sha256"}, "deadbeef")
	if !res[0].Compared || res[0].Matched {
		t.Errorf("expected a mismatch: %+v", res[0])
	}

	// No expectation means no comparison was attempted.
	res, _ = h.HashFiles([]string{p}, []string{"sha256"}, "")
	if res[0].Compared {
		t.Error("did not expect a comparison when no value was supplied")
	}
}

func TestHashFilesReportsUnreadableFileWithoutAborting(t *testing.T) {
	dir := t.TempDir()
	good := filepath.Join(dir, "ok.txt")
	if err := os.WriteFile(good, []byte("abc"), 0o644); err != nil {
		t.Fatal(err)
	}
	missing := filepath.Join(dir, "nope.txt")

	res, err := NewHashService(nil).HashFiles([]string{missing, good}, []string{"md5"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(res) != 2 {
		t.Fatalf("expected both files reported, got %d", len(res))
	}
	if res[0].Error == "" {
		t.Error("expected the missing file to carry an error")
	}
	if res[1].Error != "" || res[1].Digests[0].Hex != abcMD5 {
		t.Error("a bad file should not stop the good one from hashing")
	}
}

func TestEncodeFileBase64(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "a.png")
	if err := os.WriteFile(p, []byte("abc"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := NewHashService(nil)

	plain, err := h.EncodeFileBase64(p, false, "")
	if err != nil {
		t.Fatal(err)
	}
	if plain != base64.StdEncoding.EncodeToString([]byte("abc")) {
		t.Errorf("plain base64 = %q", plain)
	}

	uri, err := h.EncodeFileBase64(p, true, "")
	if err != nil {
		t.Fatal(err)
	}
	// The MIME type is inferred from the extension when not supplied.
	if !strings.HasPrefix(uri, "data:image/png;base64,") {
		t.Errorf("data URI = %q", uri)
	}

	custom, err := h.EncodeFileBase64(p, true, "text/plain")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(custom, "data:text/plain;base64,") {
		t.Errorf("explicit mime ignored: %q", custom)
	}

	if _, err := h.EncodeFileBase64(filepath.Join(dir, "nope"), false, ""); err == nil {
		t.Error("expected an error for a missing file")
	}
}
