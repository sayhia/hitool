package services

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

func assets(names ...string) []github.ReleaseAsset {
	out := make([]github.ReleaseAsset, len(names))
	for i, n := range names {
		out[i] = github.ReleaseAsset{Name: n}
	}
	return out
}

func TestHitoolAssetMatcher(t *testing.T) {
	// A real v0.1.0 release ships both .dmg/.zip on macOS, .exe + installer
	// on Windows, and AppImage/deb/rpm on Linux.
	macRelease := assets(
		"hitool-darwin-arm64-0.1.0.dmg",
		"hitool-darwin-arm64-0.1.0.zip",
		"hitool-darwin-amd64-0.1.0.dmg",
		"hitool-darwin-amd64-0.1.0.zip",
	)
	winRelease := assets(
		"hitool-windows-amd64-0.1.0-installer.exe",
		"hitool-windows-amd64-0.1.0.exe",
	)
	linuxRelease := assets(
		"hitool-linux-amd64-0.1.0.AppImage",
		"hitool-linux-amd64-0.1.0.deb",
		"hitool-linux-amd64-0.1.0.rpm",
	)

	cases := []struct {
		name string
		req  updater.CheckRequest
		want string
	}{
		{"darwin arm64 → zip", updater.CheckRequest{Platform: "darwin", Arch: "arm64"}, "hitool-darwin-arm64-0.1.0.zip"},
		{"darwin amd64 → zip", updater.CheckRequest{Platform: "darwin", Arch: "amd64"}, "hitool-darwin-amd64-0.1.0.zip"},
		{"windows amd64 → portable exe", updater.CheckRequest{Platform: "windows", Arch: "amd64"}, "hitool-windows-amd64-0.1.0.exe"},
		{"linux amd64 → AppImage", updater.CheckRequest{Platform: "linux", Arch: "amd64"}, "hitool-linux-amd64-0.1.0.AppImage"},
		{"linux arm64 → AppImage", updater.CheckRequest{Platform: "linux", Arch: "arm64"}, ""},
	}
	// linux arm64 has no asset in the amd64-only release slice above
	cases[4].want = "" // expect -1 (no match)

	allAssets := append(append(append([]github.ReleaseAsset{}, macRelease...), winRelease...), linuxRelease...)
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			idx := HitoolAssetMatcher(c.req, allAssets)
			if c.want == "" {
				if idx != -1 {
					t.Fatalf("expected no match (-1), got %d (%s)", idx, allAssets[idx].Name)
				}
				return
			}
			if idx < 0 || idx >= len(allAssets) {
				t.Fatalf("index %d out of range", idx)
			}
			if got := allAssets[idx].Name; got != c.want {
				t.Fatalf("got %q, want %q", got, c.want)
			}
		})
	}
}

func TestHitoolAssetMatcher_DarwinSkipsDMG(t *testing.T) {
	// Only a dmg is published (no zip) — the matcher must NOT pick it,
	// because the updater cannot install a DMG.
	a := assets("hitool-darwin-arm64-0.1.0.dmg")
	if idx := HitoolAssetMatcher(updater.CheckRequest{Platform: "darwin", Arch: "arm64"}, a); idx != -1 {
		t.Fatalf("darwin must not select a .dmg; got index %d (%s)", idx, a[idx].Name)
	}
}

func TestHitoolAssetMatcher_WindowsSkipsInstaller(t *testing.T) {
	// Only the NSIS installer is present — skip it, the portable exe is the
	// only thing the updater can swap in.
	a := assets("hitool-windows-amd64-0.1.0-installer.exe")
	if idx := HitoolAssetMatcher(updater.CheckRequest{Platform: "windows", Arch: "amd64"}, a); idx != -1 {
		t.Fatalf("windows must not select an installer; got index %d (%s)", idx, a[idx].Name)
	}
}
