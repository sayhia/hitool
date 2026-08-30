package services

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// RenameService previews and applies batch renames.
//
// This is the only service that mutates files the user already had, so it is
// deliberately conservative: the plan is computed and returned first, every
// collision is refused rather than resolved, and the apply pass renames
// through temporary names so that swaps (a→b, b→a) work.
type RenameService struct {
	store *StoreService
}

func NewRenameService(store *StoreService) *RenameService {
	return &RenameService{store: store}
}

// RenameRule describes the transformation. Steps apply in field order:
// find/replace, then case, then prefix/suffix, then numbering, then extension.
type RenameRule struct {
	Find    string `json:"find"`
	Replace string `json:"replace"`
	/** Treat Find as a regular expression rather than literal text. */
	Regex         bool   `json:"regex"`
	CaseSensitive bool   `json:"caseSensitive"`
	Prefix        string `json:"prefix"`
	Suffix        string `json:"suffix"`
	/** "", "upper", "lower", "title" — applied to the stem only. */
	CaseMode string `json:"caseMode"`
	/** When true, append a running number; {n} in prefix/suffix is replaced too. */
	Numbering bool `json:"numbering"`
	StartAt   int  `json:"startAt"`
	Padding   int  `json:"padding"`
	/** Replacement extension without the dot; empty keeps the original. */
	Extension string `json:"extension"`
}

type RenamePlanItem struct {
	Path    string `json:"path"`
	OldName string `json:"oldName"`
	NewName string `json:"newName"`
	/** Set when this row cannot be applied — the UI shows it and Run stays off. */
	Problem string `json:"problem,omitempty"`
	Changed bool   `json:"changed"`
}

type RenamePlan struct {
	Items     []RenamePlanItem `json:"items"`
	Conflicts int              `json:"conflicts"`
	Changed   int              `json:"changed"`
	Error     string           `json:"error,omitempty"`
}

var illegalName = regexp.MustCompile(`[/\\:*?"<>|]`)

func applyCase(s, mode string) string {
	switch mode {
	case "upper":
		return strings.ToUpper(s)
	case "lower":
		return strings.ToLower(s)
	case "title":
		return titleCase(s)
	default:
		return s
	}
}

// titleCase upper-cases the first letter of each word. strings.Title would
// break on any non-letter, turning "don't" into "Don'T"; only whitespace and
// the separators people actually use in filenames start a new word here.
func titleCase(s string) string {
	out := []rune(strings.ToLower(s))
	start := true
	for i, r := range out {
		if start {
			out[i] = unicode.ToUpper(r)
		}
		start = r == ' ' || r == '-' || r == '_' || r == '.'
	}
	return string(out)
}

// Plan computes the new names without touching anything on disk.
func (r *RenameService) Plan(paths []string, rule RenameRule) (*RenamePlan, error) {
	plan := &RenamePlan{Items: make([]RenamePlanItem, 0, len(paths))}

	var re *regexp.Regexp
	if rule.Regex && rule.Find != "" {
		expr := rule.Find
		if !rule.CaseSensitive {
			expr = "(?i)" + expr
		}
		compiled, err := regexp.Compile(expr)
		if err != nil {
			plan.Error = fmt.Sprintf("invalid pattern: %v", err)
			return plan, nil
		}
		re = compiled
	}

	pad := rule.Padding
	if pad < 1 {
		pad = 1
	}

	for i, p := range paths {
		old := filepath.Base(p)
		ext := filepath.Ext(old)
		stem := strings.TrimSuffix(old, ext)

		// 1. find / replace
		if rule.Find != "" {
			if re != nil {
				stem = re.ReplaceAllString(stem, rule.Replace)
			} else if rule.CaseSensitive {
				stem = strings.ReplaceAll(stem, rule.Find, rule.Replace)
			} else {
				stem = replaceInsensitive(stem, rule.Find, rule.Replace)
			}
		}

		// 2. case
		stem = applyCase(stem, rule.CaseMode)

		// 3. numbering token, usable anywhere in prefix/suffix
		num := strconv.Itoa(rule.StartAt + i)
		for len(num) < pad {
			num = "0" + num
		}
		prefix := strings.ReplaceAll(rule.Prefix, "{n}", num)
		suffix := strings.ReplaceAll(rule.Suffix, "{n}", num)

		stem = prefix + stem + suffix
		if rule.Numbering && !strings.Contains(rule.Prefix+rule.Suffix, "{n}") {
			stem += "_" + num
		}

		// 4. extension
		if rule.Extension != "" {
			ext = "." + strings.TrimPrefix(rule.Extension, ".")
		}

		item := RenamePlanItem{Path: p, OldName: old, NewName: stem + ext}
		item.Changed = item.NewName != old

		switch {
		case strings.TrimSpace(stem) == "":
			item.Problem = "empty name"
		// The whole name, not just the stem: a replacement extension is user
		// input too, and "b/c" would otherwise aim the rename at a subdirectory.
		case illegalName.MatchString(item.NewName):
			item.Problem = "illegal character"
		case len(item.NewName) > 255:
			item.Problem = "name too long"
		}

		plan.Items = append(plan.Items, item)
	}

	// Collisions can only be judged once every new name is known: a name is
	// free if the file sitting on it is one this batch actually moves away.
	// Being in the selection is not enough — a selected file whose name the
	// rule leaves alone stays exactly where it is, and renaming another file
	// onto it would destroy it.
	vacating := map[string]bool{}
	for _, it := range plan.Items {
		if it.Changed && it.Problem == "" {
			vacating[strings.ToLower(it.Path)] = true
		}
	}

	seen := map[string]int{} // target path -> count, for in-batch collisions
	for i := range plan.Items {
		it := &plan.Items[i]
		if it.Problem != "" || !it.Changed {
			continue
		}
		target := filepath.Join(filepath.Dir(it.Path), it.NewName)
		key := strings.ToLower(target)
		seen[key]++
		switch {
		case seen[key] > 1:
			it.Problem = "duplicate target"
		case vacating[key]:
			// The occupant leaves in the same batch; the two-phase apply in
			// Apply() is what makes the ordering safe.
		default:
			if _, err := os.Stat(target); err == nil {
				it.Problem = "target exists"
			}
		}
	}

	for _, it := range plan.Items {
		if it.Problem != "" {
			plan.Conflicts++
		} else if it.Changed {
			plan.Changed++
		}
	}

	return plan, nil
}

func replaceInsensitive(s, find, repl string) string {
	if find == "" {
		return s
	}
	var b strings.Builder
	lower, lf := strings.ToLower(s), strings.ToLower(find)
	for {
		i := strings.Index(lower, lf)
		if i < 0 {
			b.WriteString(s)
			return b.String()
		}
		b.WriteString(s[:i])
		b.WriteString(repl)
		s, lower = s[i+len(find):], lower[i+len(lf):]
	}
}

type RenameResult struct {
	Renamed int      `json:"renamed"`
	Failed  int      `json:"failed"`
	Errors  []string `json:"errors"`
}

// Apply executes a plan. It refuses outright if any row has a problem — a
// partially applied batch rename is far harder to recover from than one that
// never started.
func (r *RenameService) Apply(paths []string, rule RenameRule) (*RenameResult, error) {
	plan, err := r.Plan(paths, rule)
	if err != nil {
		return nil, err
	}
	if plan.Error != "" {
		return nil, fmt.Errorf("%s", plan.Error)
	}
	if plan.Conflicts > 0 {
		return nil, fmt.Errorf("%d name(s) would conflict; resolve them before applying", plan.Conflicts)
	}

	res := &RenameResult{Errors: []string{}}

	// Two phases so a swap (a→b, b→a) doesn't clobber itself midway. The
	// staging name is an index rather than the new name, because the new name
	// may already be at the 255-byte limit and the prefix would push it over.
	type pending struct{ orig, tmp, final string }
	staged := make([]pending, 0, len(plan.Items))

	rollback := func() {
		for _, s := range staged {
			_ = os.Rename(s.tmp, s.orig)
		}
	}

	for i, it := range plan.Items {
		if !it.Changed || it.Problem != "" {
			continue
		}
		dir := filepath.Dir(it.Path)
		tmp := filepath.Join(dir, fmt.Sprintf(".hitool-rename-%d", i))
		if err := os.Rename(it.Path, tmp); err != nil {
			// Nothing has landed on a final name yet, so a clean abort is
			// still possible — take it rather than applying half a batch.
			rollback()
			return nil, fmt.Errorf("%s: %w", it.OldName, err)
		}
		staged = append(staged, pending{orig: it.Path, tmp: tmp, final: filepath.Join(dir, it.NewName)})
	}

	// Past this point some files already carry their new names, so a failure
	// can only be reported per row — undoing the successful ones would be a
	// second surprise on top of the first.
	for _, s := range staged {
		if err := os.Rename(s.tmp, s.final); err != nil {
			res.Failed++
			res.Errors = append(res.Errors, fmt.Sprintf("%s: %v", filepath.Base(s.final), err))
			_ = os.Rename(s.tmp, s.orig)
			continue
		}
		res.Renamed++
	}

	if r.store != nil && res.Renamed > 0 {
		_ = r.store.AddHistory("batch-rename", fmt.Sprintf("%d files", res.Renamed))
	}
	return res, nil
}
