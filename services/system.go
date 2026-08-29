package services

import (
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// SystemService exposes directories, dialogs, shell and file helpers.
type SystemService struct{}

func NewSystemService() *SystemService {
	return &SystemService{}
}

// GetVersion returns the build-time version ("dev" for local builds, the
// tagged semver for release builds). The frontend compares it against the
// latest GitHub release to offer updates.
func (s *SystemService) GetVersion() string {
	return Version
}

func (s *SystemService) GetDocumentsDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Documents"), nil
}

func (s *SystemService) GetDownloadsDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Downloads"), nil
}

// DefaultOutputDir returns (and creates) ~/Documents/HiTool/<sub>.
func (s *SystemService) DefaultOutputDir(sub string) (string, error) {
	docs, err := s.GetDocumentsDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(docs, "HiTool", filepath.Base(sub))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

func (s *SystemService) OpenURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("unsupported URL scheme: %s", u.Scheme)
	}
	return openWithOS(raw)
}

func (s *SystemService) OpenPath(path string) error {
	if strings.ContainsRune(path, 0) {
		return fmt.Errorf("invalid path")
	}
	return openWithOS(path)
}

func (s *SystemService) RevealInFolder(path string) error {
	if strings.ContainsRune(path, 0) {
		return fmt.Errorf("invalid path")
	}
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", "-R", path).Start()
	case "windows":
		return exec.Command("explorer", "/select,", path).Start()
	default:
		return exec.Command("xdg-open", filepath.Dir(path)).Start()
	}
}

func openWithOS(target string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", target).Start()
	case "windows":
		return exec.Command("explorer", target).Start()
	default:
		return exec.Command("xdg-open", target).Start()
	}
}

// SelectFiles opens a native multi/single file picker. Patterns look like "*.pdf".
func (s *SystemService) SelectFiles(title string, filterName string, patterns []string, multiple bool) ([]string, error) {
	dlg := application.Get().Dialog.OpenFile().SetTitle(title).CanChooseFiles(true).CanChooseDirectories(false)
	if len(patterns) > 0 {
		dlg.AddFilter(filterName, strings.Join(patterns, ";"))
	}
	if multiple {
		paths, err := dlg.PromptForMultipleSelection()
		if err != nil {
			return nil, err
		}
		return paths, nil
	}
	p, err := dlg.PromptForSingleSelection()
	if err != nil {
		return nil, err
	}
	if p == "" {
		return []string{}, nil
	}
	return []string{p}, nil
}

// SelectDirectory opens a native directory picker; returns "" when cancelled.
func (s *SystemService) SelectDirectory(title string) (string, error) {
	dlg := application.Get().Dialog.OpenFile().SetTitle(title).
		CanChooseDirectories(true).CanChooseFiles(false).CanCreateDirectories(true)
	return dlg.PromptForSingleSelection()
}

// SaveFile opens a native save dialog; returns "" when cancelled.
func (s *SystemService) SaveFile(title string, defaultName string) (string, error) {
	dlg := application.Get().Dialog.SaveFile().SetFilename(defaultName).CanCreateDirectories(true)
	dlg.SetMessage(title)
	return dlg.PromptForSingleSelection()
}

const maxReadSize = 500 * 1024 * 1024 // 500MB cap on text reads

// ReadFileBytes returns the raw content of a file (base64 across the bridge).
func (s *SystemService) ReadFileBytes(path string) ([]byte, error) {
	if strings.ContainsRune(path, 0) {
		return nil, fmt.Errorf("invalid path")
	}
	st, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read file metadata: %w", err)
	}
	if st.Size() > maxReadSize {
		return nil, fmt.Errorf("file too large (%dMB, max 500MB)", st.Size()/1024/1024)
	}
	return os.ReadFile(path)
}

func (s *SystemService) WriteFileBytes(path string, data []byte) error {
	if err := ensureParent(path); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// WriteFileChunk appends chunked data; offset 0 truncates first.
func (s *SystemService) WriteFileChunk(path string, offset int64, data []byte) error {
	if err := ensureParent(path); err != nil {
		return err
	}
	flags := os.O_CREATE | os.O_WRONLY
	if offset == 0 {
		flags |= os.O_TRUNC
	}
	f, err := os.OpenFile(path, flags, 0o644)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()
	if _, err := f.WriteAt(data, offset); err != nil {
		return fmt.Errorf("failed to write: %w", err)
	}
	return nil
}

func ensureParent(path string) error {
	if strings.ContainsRune(path, 0) {
		return fmt.Errorf("invalid path")
	}
	parent := filepath.Dir(path)
	if parent != "" {
		if err := os.MkdirAll(parent, 0o755); err != nil {
			return fmt.Errorf("failed to create directory: %w", err)
		}
	}
	return nil
}

func (s *SystemService) PathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func (s *SystemService) GetFileSize(path string) (int64, error) {
	st, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	return st.Size(), nil
}

type FileInfo struct {
	Path string `json:"path"`
	Name string `json:"name"`
	Size int64  `json:"size"`
}

// StatFiles maps paths to name+size info, skipping unreadable entries.
func (s *SystemService) StatFiles(paths []string) []FileInfo {
	return StatPaths(paths)
}

// maxDropFiles caps how many files a single drop can expand into, so dragging
// a huge folder tree can't stall the app while it stats everything.
const maxDropFiles = 500

// maxDropDepth bounds folder recursion — deep trees beyond this are rare in
// real drops and usually mean a vendor or cache directory.
const maxDropDepth = 4

// StatPaths resolves paths to name+size info, expanding dropped folders into
// the files they contain. Shared by the file dialog and the drag-drop handler.
func StatPaths(paths []string) []FileInfo {
	out := make([]FileInfo, 0, len(paths))
	remaining := maxDropFiles
	for _, p := range paths {
		st, err := os.Stat(p)
		if err != nil {
			continue
		}
		// Dropped folders expand into the files they contain, which is what
		// "drop a folder of photos" means to a batch tool.
		if st.IsDir() {
			out = append(out, expandDir(p, maxDropDepth, &remaining)...)
			continue
		}
		out = append(out, FileInfo{Path: p, Name: filepath.Base(p), Size: st.Size()})
		remaining--
		if remaining <= 0 {
			break
		}
	}
	return out
}

// expandDir collects files under root, depth-first, skipping hidden entries.
// os.ReadDir returns entries sorted by name, so the result is deterministic.
func expandDir(root string, depth int, remaining *int) []FileInfo {
	if depth <= 0 || *remaining <= 0 {
		return nil
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var out []FileInfo
	for _, e := range entries {
		if *remaining <= 0 {
			break
		}
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		full := filepath.Join(root, e.Name())
		if e.IsDir() {
			out = append(out, expandDir(full, depth-1, remaining)...)
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, FileInfo{Path: full, Name: e.Name(), Size: info.Size()})
		*remaining--
	}
	return out
}

// FilesDropped is emitted to the frontend when files are dropped on the window.
// Zone carries the data-file-drop-target value of the element they landed on.
type FilesDropped struct {
	Zone  string     `json:"zone"`
	Files []FileInfo `json:"files"`
}

// UniqueOutputPath returns dir/stem+ext, suffixing _1, _2 … when taken.
func UniqueOutputPath(dir, stem, ext string) string {
	p := filepath.Join(dir, stem+ext)
	for i := 1; ; i++ {
		if _, err := os.Stat(p); os.IsNotExist(err) {
			return p
		}
		p = filepath.Join(dir, fmt.Sprintf("%s_%d%s", stem, i, ext))
	}
}
