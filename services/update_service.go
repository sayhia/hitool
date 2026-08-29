package services

import (
	"context"
	"errors"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

// UpdateService bridges the Wails v3 updater (app.Updater) to the frontend.
// It is registered as an application.Service after the app is created, so the
// UI can drive Check / DownloadAndInstall through generated bindings and
// subscribe to the wails:updater:* events for progress.
type UpdateService struct {
	updater *updater.Updater
}

func NewUpdateService(u *updater.Updater) *UpdateService {
	return &UpdateService{updater: u}
}

// CheckResult is what the frontend renders. When HasUpdate is false the other
// fields are zero — the running build is already the latest release.
type CheckResult struct {
	HasUpdate      bool   `json:"hasUpdate"`
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	ReleaseURL     string `json:"releaseUrl"`
	Notes          string `json:"notes"`
	ArtifactName   string `json:"artifactName"`
}

// Check asks the configured providers for a newer release. Returns a result
// with HasUpdate=false when already up to date (no error).
func (s *UpdateService) Check() (*CheckResult, error) {
	if s.updater == nil {
		return nil, errors.New("updater not configured")
	}
	rel, err := s.updater.Check(context.Background())
	if err != nil {
		return nil, err
	}
	res := &CheckResult{CurrentVersion: s.updater.CurrentVersion()}
	if rel != nil {
		res.HasUpdate = true
		res.LatestVersion = rel.Version
		res.Notes = rel.Notes
		res.ArtifactName = rel.Artifact.Filename
		if u, ok := rel.Metadata["github.release.htmlURL"].(string); ok {
			res.ReleaseURL = u
		}
	}
	return res, nil
}

// DownloadAndInstall streams the release selected by a previous Check,
// verifies it, and stages it for the binary swap. The app must restart for
// the new version to take effect — the frontend listens for the
// wails:updater:update-ready event and prompts the user.
func (s *UpdateService) DownloadAndInstall() error {
	if s.updater == nil {
		return errors.New("updater not configured")
	}
	return s.updater.DownloadAndInstall(context.Background())
}

// State reports the updater lifecycle phase (idle/checking/downloading/…).
func (s *UpdateService) State() string {
	if s.updater == nil {
		return "unconfigured"
	}
	return string(s.updater.State())
}

// Restart relaunches the application with the newly staged binary. The Wails
// updater re-executes the running process in helper mode, which waits for the
// current process to exit, swaps the on-disk binary, and relaunches — so this
// call does not return (the process exits during the swap).
func (s *UpdateService) Restart() error {
	if s.updater == nil {
		return errors.New("updater not configured")
	}
	return s.updater.Restart(context.Background())
}

// CurrentVersion returns the build-time version injected via -ldflags.
func (s *UpdateService) CurrentVersion() string {
	if s.updater == nil {
		return Version
	}
	return s.updater.CurrentVersion()
}

// HitoolAssetMatcher picks the release asset the Wails updater can install.
//
// The updater only knows how to extract zip / tar.gz and then swap a single
// top-level entry (a .app bundle or a bare executable), so:
//   - darwin  → the .zip that contains hitool.app (NOT the .dmg — the updater
//     cannot mount a DMG)
//   - windows → the portable .exe (NOT the NSIS -installer.exe, which is a
//     self-extracting setup program the updater cannot swap in)
//   - linux   → the .AppImage (a single relocatable executable)
//
// It is exported so a test can pin the selection rules.
func HitoolAssetMatcher(req updater.CheckRequest, assets []github.ReleaseAsset) int {
	plat := strings.ToLower(req.Platform)
	arch := strings.ToLower(req.Arch)

	var wantSuffix string
	switch plat {
	case "darwin":
		wantSuffix = ".zip"
	case "windows":
		wantSuffix = ".exe"
	case "linux":
		wantSuffix = ".appimage"
	}

	for i, a := range assets {
		name := strings.ToLower(a.Name)
		if !strings.Contains(name, plat) {
			continue
		}
		if !matchArch(name, arch) {
			continue
		}
		// Windows: the NSIS installer also ends in .exe and matches the
		// platform/arch tokens — skip it so the portable binary wins.
		if plat == "windows" && strings.Contains(name, "installer") {
			continue
		}
		if wantSuffix != "" && !strings.HasSuffix(name, wantSuffix) {
			continue
		}
		return i
	}
	return -1
}

// matchArch mirrors github.DefaultAssetMatcher's arch aliases: amd64 ↔
// x86_64/x64, arm64 ↔ aarch64.
func matchArch(name, arch string) bool {
	if arch == "" {
		return true
	}
	if strings.Contains(name, arch) {
		return true
	}
	if arch == "amd64" && (strings.Contains(name, "x86_64") || strings.Contains(name, "x64")) {
		return true
	}
	if arch == "arm64" && strings.Contains(name, "aarch64") {
		return true
	}
	return false
}
