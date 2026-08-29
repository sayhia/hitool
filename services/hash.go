package services

import (
	"crypto/md5"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"hash"
	"hash/crc32"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
)

// HashService computes checksums for text and for files. Files are streamed so
// a multi-gigabyte input costs a fixed 1MB of memory rather than its own size.
type HashService struct {
	store  *StoreService
	cancel atomic.Bool
}

func NewHashService(store *StoreService) *HashService {
	return &HashService{store: store}
}

// ALGORITHMS is the fixed set the UI offers; the order is the display order.
var hashAlgos = []string{"md5", "sha1", "sha256", "sha512", "crc32"}

func (h *HashService) Algorithms() []string {
	return hashAlgos
}

func newHasher(algo string) (hash.Hash, error) {
	switch strings.ToLower(algo) {
	case "md5":
		return md5.New(), nil
	case "sha1":
		return sha1.New(), nil
	case "sha256":
		return sha256.New(), nil
	case "sha512":
		return sha512.New(), nil
	case "crc32":
		return crc32.NewIEEE(), nil
	default:
		return nil, fmt.Errorf("unsupported algorithm: %s", algo)
	}
}

type HashDigest struct {
	Algo   string `json:"algo"`
	Hex    string `json:"hex"`
	Base64 string `json:"base64"`
}

// HashText digests a string with every requested algorithm in one pass over
// the input per algorithm — cheap, since text is already in memory.
func (h *HashService) HashText(text string, algos []string) ([]HashDigest, error) {
	if len(algos) == 0 {
		algos = hashAlgos
	}
	out := make([]HashDigest, 0, len(algos))
	for _, a := range algos {
		hs, err := newHasher(a)
		if err != nil {
			return nil, err
		}
		hs.Write([]byte(text))
		sum := hs.Sum(nil)
		out = append(out, HashDigest{
			Algo:   a,
			Hex:    hex.EncodeToString(sum),
			Base64: base64.StdEncoding.EncodeToString(sum),
		})
	}
	return out, nil
}

type FileHashResult struct {
	Path    string       `json:"path"`
	Name    string       `json:"name"`
	Size    int64        `json:"size"`
	Digests []HashDigest `json:"digests"`
	Error   string       `json:"error,omitempty"`
	/** Set when the caller supplied an expected value to compare against. */
	Matched  bool `json:"matched"`
	Compared bool `json:"compared"`
}

func (h *HashService) Cancel() {
	h.cancel.Store(true)
}

// HashFiles streams each file once, feeding every requested algorithm from the
// same read. `expect` may be empty; when set, each file is marked matched if
// any of its digests equals it (case-insensitive, hex or base64).
func (h *HashService) HashFiles(paths []string, algos []string, expect string) ([]FileHashResult, error) {
	if len(algos) == 0 {
		algos = []string{"sha256"}
	}
	h.cancel.Store(false)
	want := strings.TrimSpace(strings.ToLower(expect))

	results := make([]FileHashResult, 0, len(paths))
	total := len(paths)

	for i, p := range paths {
		if h.cancel.Load() {
			break
		}
		name := filepath.Base(p)
		emitProgress(ConvertProgress{FileName: name, Current: i + 1, Total: total, Status: "converting"})

		res := FileHashResult{Path: p, Name: name}
		if st, err := os.Stat(p); err == nil {
			res.Size = st.Size()
		}

		digests, err := h.hashOneFile(p, algos)
		if err != nil {
			res.Error = err.Error()
			emitProgress(ConvertProgress{FileName: name, Current: i + 1, Total: total, Progress: 1, Status: "error"})
		} else {
			res.Digests = digests
			if want != "" {
				res.Compared = true
				for _, d := range digests {
					if strings.ToLower(d.Hex) == want || strings.ToLower(d.Base64) == want {
						res.Matched = true
						break
					}
				}
			}
			emitProgress(ConvertProgress{FileName: name, Current: i + 1, Total: total, Progress: 1, Status: "done"})
		}
		results = append(results, res)
	}

	if h.store != nil && len(results) > 0 {
		_ = h.store.AddHistory("hash-calc", fmt.Sprintf("%d files, %s", len(results), strings.Join(algos, "/")))
	}
	return results, nil
}

// hashOneFile reads the file once and tees it into every hasher, so N
// algorithms cost one read rather than N.
func (h *HashService) hashOneFile(path string, algos []string) ([]HashDigest, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	hashers := make([]hash.Hash, 0, len(algos))
	writers := make([]io.Writer, 0, len(algos))
	for _, a := range algos {
		hs, err := newHasher(a)
		if err != nil {
			return nil, err
		}
		hashers = append(hashers, hs)
		writers = append(writers, hs)
	}

	buf := make([]byte, 1<<20) // 1MB, keeps memory flat regardless of file size
	multi := io.MultiWriter(writers...)
	for {
		if h.cancel.Load() {
			return nil, fmt.Errorf("cancelled")
		}
		n, err := f.Read(buf)
		if n > 0 {
			if _, werr := multi.Write(buf[:n]); werr != nil {
				return nil, werr
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
	}

	out := make([]HashDigest, 0, len(hashers))
	for i, hs := range hashers {
		sum := hs.Sum(nil)
		out = append(out, HashDigest{
			Algo:   algos[i],
			Hex:    hex.EncodeToString(sum),
			Base64: base64.StdEncoding.EncodeToString(sum),
		})
	}
	return out, nil
}

// EncodeFileBase64 returns a file's contents as base64, optionally wrapped as a
// data URI. Guarded by the same size cap as ReadFileBytes so the bridge can't
// be handed a gigabyte string.
func (h *HashService) EncodeFileBase64(path string, asDataURI bool, mime string) (string, error) {
	st, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	// base64 inflates by 4/3, so cap the source well below the read limit.
	const maxSrc = 48 * 1024 * 1024
	if st.Size() > maxSrc {
		return "", fmt.Errorf("file too large (%dMB, max 48MB for base64)", st.Size()/1024/1024)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	enc := base64.StdEncoding.EncodeToString(data)
	if !asDataURI {
		return enc, nil
	}
	if mime == "" {
		mime = mimeByExt(filepath.Ext(path))
	}
	return fmt.Sprintf("data:%s;base64,%s", mime, enc), nil
}

func mimeByExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	case ".pdf":
		return "application/pdf"
	case ".json":
		return "application/json"
	case ".txt", ".md":
		return "text/plain"
	case ".css":
		return "text/css"
	case ".js":
		return "text/javascript"
	default:
		return "application/octet-stream"
	}
}
