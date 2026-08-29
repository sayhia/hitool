package services

import (
	"fmt"
	"image"
	"os"
	"path/filepath"
	"strings"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// PDFService implements the Document Studio tools on top of pdfcpu.
type PDFService struct {
	store *StoreService
}

func NewPDFService(store *StoreService) *PDFService {
	return &PDFService{store: store}
}

type PDFResult struct {
	Success     bool     `json:"success"`
	OutputPath  string   `json:"outputPath"`
	OutputDir   string   `json:"outputDir"`
	OutputFiles []string `json:"outputFiles"`
	Error       string   `json:"error,omitempty"`
	InputSize   int64    `json:"inputSize,omitempty"`
	OutputSize  int64    `json:"outputSize,omitempty"`
}

func stemOf(path string) string {
	base := filepath.Base(path)
	return strings.TrimSuffix(base, filepath.Ext(base))
}

func fileSizeOf(path string) int64 {
	st, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return st.Size()
}

func (p *PDFService) record(tool, detail string) {
	if p.store != nil {
		_ = p.store.AddHistory(tool, detail)
	}
}

// PageCount returns the number of pages in a PDF.
func (p *PDFService) PageCount(input string) (int, error) {
	return api.PageCountFile(input)
}

// Merge joins inputs (in order) into one PDF inside outDir.
func (p *PDFService) Merge(inputs []string, outDir string) (*PDFResult, error) {
	if len(inputs) < 2 {
		return nil, fmt.Errorf("need at least 2 PDF files")
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}
	out := UniqueOutputPath(outDir, stemOf(inputs[0])+"_merged", ".pdf")
	if err := api.MergeCreateFile(inputs, out, false, model.NewDefaultConfiguration()); err != nil {
		return &PDFResult{Success: false, Error: err.Error()}, nil
	}
	p.record("pdf-merge", fmt.Sprintf("%d files -> %s", len(inputs), filepath.Base(out)))
	return &PDFResult{Success: true, OutputPath: out, OutputDir: outDir, OutputFiles: []string{out}}, nil
}

// Split cuts a PDF. mode "each" = one file per page, "span" = every N pages,
// "range" = extract the given page selection (e.g. "1-3,7") into one file.
func (p *PDFService) Split(input string, outDir string, mode string, span int, pages string) (*PDFResult, error) {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}
	conf := model.NewDefaultConfiguration()
	switch mode {
	case "range":
		sel := strings.TrimSpace(pages)
		if sel == "" {
			return nil, fmt.Errorf("page range is empty")
		}
		out := UniqueOutputPath(outDir, stemOf(input)+"_pages", ".pdf")
		if err := api.TrimFile(input, out, []string{sel}, conf); err != nil {
			return &PDFResult{Success: false, Error: err.Error()}, nil
		}
		p.record("pdf-split", fmt.Sprintf("%s pages %s", filepath.Base(input), sel))
		return &PDFResult{Success: true, OutputPath: out, OutputDir: outDir, OutputFiles: []string{out}}, nil
	default:
		n := 1
		if mode == "span" && span > 1 {
			n = span
		}
		// pdfcpu writes <stem>_<from>-<to>.pdf files into a directory; use a
		// fresh subfolder so the output set is easy to identify.
		sub := UniqueOutputPath(outDir, stemOf(input)+"_split", "")
		if err := os.MkdirAll(sub, 0o755); err != nil {
			return nil, err
		}
		if err := api.SplitFile(input, sub, n, conf); err != nil {
			return &PDFResult{Success: false, Error: err.Error()}, nil
		}
		entries, _ := os.ReadDir(sub)
		files := make([]string, 0, len(entries))
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(strings.ToLower(e.Name()), ".pdf") {
				files = append(files, filepath.Join(sub, e.Name()))
			}
		}
		p.record("pdf-split", fmt.Sprintf("%s -> %d files", filepath.Base(input), len(files)))
		return &PDFResult{Success: true, OutputPath: sub, OutputDir: sub, OutputFiles: files}, nil
	}
}

// Rotate turns pages by degrees (90/180/270). pages "" means all pages.
func (p *PDFService) Rotate(input string, outDir string, degrees int, pages string) (*PDFResult, error) {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}
	var sel []string
	if s := strings.TrimSpace(pages); s != "" {
		sel = []string{s}
	}
	out := UniqueOutputPath(outDir, stemOf(input)+"_rotated", ".pdf")
	if err := api.RotateFile(input, out, degrees, sel, model.NewDefaultConfiguration()); err != nil {
		return &PDFResult{Success: false, Error: err.Error()}, nil
	}
	p.record("pdf-rotate", fmt.Sprintf("%s %d°", filepath.Base(input), degrees))
	return &PDFResult{Success: true, OutputPath: out, OutputDir: outDir, OutputFiles: []string{out}}, nil
}

// Encrypt protects a PDF with a user (open) password. AES-256 by default.
func (p *PDFService) Encrypt(input string, outDir string, userPw string, ownerPw string) (*PDFResult, error) {
	if strings.TrimSpace(userPw) == "" {
		return nil, fmt.Errorf("password is empty")
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}
	conf := model.NewDefaultConfiguration()
	conf.UserPW = userPw
	if strings.TrimSpace(ownerPw) != "" {
		conf.OwnerPW = ownerPw
	} else {
		conf.OwnerPW = userPw
	}
	out := UniqueOutputPath(outDir, stemOf(input)+"_encrypted", ".pdf")
	if err := api.EncryptFile(input, out, conf); err != nil {
		return &PDFResult{Success: false, Error: err.Error()}, nil
	}
	p.record("pdf-encrypt", filepath.Base(input))
	return &PDFResult{Success: true, OutputPath: out, OutputDir: outDir, OutputFiles: []string{out}}, nil
}

// Decrypt removes the password of a protected PDF.
func (p *PDFService) Decrypt(input string, outDir string, password string) (*PDFResult, error) {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}
	conf := model.NewDefaultConfiguration()
	conf.UserPW = password
	conf.OwnerPW = password
	out := UniqueOutputPath(outDir, stemOf(input)+"_decrypted", ".pdf")
	if err := api.DecryptFile(input, out, conf); err != nil {
		return &PDFResult{Success: false, Error: err.Error()}, nil
	}
	p.record("pdf-decrypt", filepath.Base(input))
	return &PDFResult{Success: true, OutputPath: out, OutputDir: outDir, OutputFiles: []string{out}}, nil
}

// Compress rewrites the PDF through pdfcpu's optimizer.
func (p *PDFService) Compress(input string, outDir string) (*PDFResult, error) {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}
	out := UniqueOutputPath(outDir, stemOf(input)+"_compressed", ".pdf")
	conf := model.NewDefaultConfiguration()
	conf.Optimize = true
	conf.OptimizeResourceDicts = true
	conf.OptimizeDuplicateContentStreams = true
	if err := api.OptimizeFile(input, out, conf); err != nil {
		return &PDFResult{Success: false, Error: err.Error()}, nil
	}
	res := &PDFResult{
		Success: true, OutputPath: out, OutputDir: outDir, OutputFiles: []string{out},
		InputSize: fileSizeOf(input), OutputSize: fileSizeOf(out),
	}
	p.record("pdf-compress", fmt.Sprintf("%s %d -> %d bytes", filepath.Base(input), res.InputSize, res.OutputSize))
	return res, nil
}

// FromImages builds a PDF whose pages each carry one image.
//
// `pageSize` is a pdfcpu paper name (A4, Letter, …) or "auto" to make each
// page exactly the image's own size — the right default for scans and
// screenshots, where letterboxing onto A4 would only add noise.
func (p *PDFService) FromImages(inputs []string, outDir string, pageSize string, landscape bool) (*PDFResult, error) {
	if len(inputs) == 0 {
		return nil, fmt.Errorf("no images selected")
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}

	out := UniqueOutputPath(outDir, stemOf(inputs[0]), ".pdf")
	var err error
	if strings.EqualFold(pageSize, "auto") {
		err = importAutoSized(inputs, out)
	} else {
		err = importFixedSize(inputs, out, pageSize, landscape)
	}
	if err != nil {
		return &PDFResult{Success: false, Error: err.Error()}, nil
	}

	p.record("image-to-pdf", fmt.Sprintf("%d images -> %s", len(inputs), filepath.Base(out)))
	return &PDFResult{
		Success: true, OutputPath: out, OutputDir: outDir, OutputFiles: []string{out},
		OutputSize: fileSizeOf(out),
	}, nil
}

func importFixedSize(inputs []string, out, pageSize string, landscape bool) error {
	imp := pdfcpu.DefaultImportConfig()
	dim, name, err := types.ParsePageFormat(pageSize)
	if err != nil {
		return err
	}
	if landscape {
		dim = &types.Dim{Width: dim.Height, Height: dim.Width}
	}
	imp.PageDim = dim
	imp.PageSize = name
	imp.UserDim = true
	imp.Scale = 1.0
	imp.Pos = types.Full
	return api.ImportImagesFile(inputs, out, imp, model.NewDefaultConfiguration())
}

// importAutoSized gives each image a page of its own dimensions. pdfcpu applies
// one page size to a whole import run — and passing a nil PageDim panics inside
// it — so each image becomes a one-page PDF that is then merged.
func importAutoSized(inputs []string, out string) error {
	tmp, err := os.MkdirTemp("", "hitool-img2pdf-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmp)

	pages := make([]string, 0, len(inputs))
	for i, in := range inputs {
		w, h, err := imagePixelSize(in)
		if err != nil {
			return fmt.Errorf("%s: %w", filepath.Base(in), err)
		}
		imp := pdfcpu.DefaultImportConfig()
		// Images carry no physical size, so map one pixel to one point (72dpi).
		imp.PageDim = &types.Dim{Width: float64(w), Height: float64(h)}
		imp.PageSize = ""
		imp.UserDim = true
		imp.Scale = 1.0
		imp.Pos = types.Full

		page := filepath.Join(tmp, fmt.Sprintf("p%04d.pdf", i))
		if err := api.ImportImagesFile([]string{in}, page, imp, model.NewDefaultConfiguration()); err != nil {
			return err
		}
		pages = append(pages, page)
	}

	if len(pages) == 1 {
		data, err := os.ReadFile(pages[0])
		if err != nil {
			return err
		}
		return os.WriteFile(out, data, 0o644)
	}
	return api.MergeCreateFile(pages, out, false, model.NewDefaultConfiguration())
}

func imagePixelSize(path string) (int, int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()
	cfg, _, err := image.DecodeConfig(f)
	if err != nil {
		return 0, 0, err
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return 0, 0, fmt.Errorf("image has no usable dimensions")
	}
	return cfg.Width, cfg.Height, nil
}

// PageSizes lists the paper names the UI may offer, "auto" first.
func (p *PDFService) PageSizes() []string {
	return []string{"auto", "A3", "A4", "A5", "Letter", "Legal", "Ledger", "Tabloid"}
}
