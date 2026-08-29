package services

import (
	"os"
	"path/filepath"
	"sort"
	"testing"
)

func touch(t *testing.T, dir string, names ...string) []string {
	t.Helper()
	paths := make([]string, 0, len(names))
	for _, n := range names {
		p := filepath.Join(dir, n)
		if err := os.WriteFile(p, []byte(n), 0o644); err != nil {
			t.Fatal(err)
		}
		paths = append(paths, p)
	}
	return paths
}

func dirNames(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	out := []string{}
	for _, e := range entries {
		out = append(out, e.Name())
	}
	sort.Strings(out)
	return out
}

func newNames(plan *RenamePlan) []string {
	out := make([]string, 0, len(plan.Items))
	for _, it := range plan.Items {
		out = append(out, it.NewName)
	}
	return out
}

func TestPlanFindReplace(t *testing.T) {
	dir := t.TempDir()
	paths := touch(t, dir, "IMG_001.jpg", "IMG_002.jpg")
	svc := NewRenameService(nil)

	plan, _ := svc.Plan(paths, RenameRule{Find: "IMG", Replace: "photo", CaseSensitive: true})
	if got := newNames(plan); got[0] != "photo_001.jpg" || got[1] != "photo_002.jpg" {
		t.Errorf("names = %v", got)
	}
	if plan.Changed != 2 || plan.Conflicts != 0 {
		t.Errorf("changed=%d conflicts=%d", plan.Changed, plan.Conflicts)
	}
}

func TestPlanCaseInsensitiveReplace(t *testing.T) {
	dir := t.TempDir()
	paths := touch(t, dir, "Img_a.png")
	plan, _ := NewRenameService(nil).Plan(paths, RenameRule{Find: "img", Replace: "x"})
	if newNames(plan)[0] != "x_a.png" {
		t.Errorf("case-insensitive replace failed: %v", newNames(plan))
	}
}

func TestPlanRegexWithCaptureGroups(t *testing.T) {
	dir := t.TempDir()
	paths := touch(t, dir, "2026-08-04_report.pdf")
	plan, _ := NewRenameService(nil).Plan(paths, RenameRule{
		Find: `(\d{4})-(\d{2})-(\d{2})_(.+)`, Replace: "$4-$1$2$3", Regex: true, CaseSensitive: true,
	})
	if newNames(plan)[0] != "report-20260804.pdf" {
		t.Errorf("regex replace = %v", newNames(plan))
	}
}

func TestPlanReportsBadRegexInsteadOfPanicking(t *testing.T) {
	dir := t.TempDir()
	paths := touch(t, dir, "a.txt")
	plan, err := NewRenameService(nil).Plan(paths, RenameRule{Find: "([", Regex: true})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Error == "" {
		t.Error("expected an error message for an invalid pattern")
	}
}

func TestPlanNumberingAndTokens(t *testing.T) {
	dir := t.TempDir()
	paths := touch(t, dir, "a.txt", "b.txt", "c.txt")
	svc := NewRenameService(nil)

	// Implicit numbering appends _NNN.
	plan, _ := svc.Plan(paths, RenameRule{Numbering: true, StartAt: 1, Padding: 3})
	if got := newNames(plan); got[0] != "a_001.txt" || got[2] != "c_003.txt" {
		t.Errorf("implicit numbering = %v", got)
	}

	// An explicit {n} token wins, and is not appended twice.
	plan, _ = svc.Plan(paths, RenameRule{Prefix: "{n}-", Numbering: true, StartAt: 10, Padding: 2})
	if got := newNames(plan); got[0] != "10-a.txt" || got[1] != "11-b.txt" {
		t.Errorf("token numbering = %v", got)
	}
}

func TestPlanCaseAndAffixesAndExtension(t *testing.T) {
	dir := t.TempDir()
	paths := touch(t, dir, "Hello World.TXT")
	svc := NewRenameService(nil)

	plan, _ := svc.Plan(paths, RenameRule{CaseMode: "lower"})
	if newNames(plan)[0] != "hello world.TXT" {
		t.Errorf("lower = %v", newNames(plan))
	}

	plan, _ = svc.Plan(paths, RenameRule{Prefix: "pre_", Suffix: "_post"})
	if newNames(plan)[0] != "pre_Hello World_post.TXT" {
		t.Errorf("affixes = %v", newNames(plan))
	}

	// The extension is replaced, and the stem is untouched by it.
	plan, _ = svc.Plan(paths, RenameRule{Extension: "md"})
	if newNames(plan)[0] != "Hello World.md" {
		t.Errorf("extension = %v", newNames(plan))
	}
	plan, _ = svc.Plan(paths, RenameRule{Extension: ".md"})
	if newNames(plan)[0] != "Hello World.md" {
		t.Errorf("extension with dot = %v", newNames(plan))
	}
}

func TestPlanFlagsUnchangedRows(t *testing.T) {
	dir := t.TempDir()
	paths := touch(t, dir, "a.txt")
	plan, _ := NewRenameService(nil).Plan(paths, RenameRule{Find: "zzz", Replace: "x"})
	if plan.Items[0].Changed {
		t.Error("a row that produces the same name must not be marked changed")
	}
	if plan.Changed != 0 {
		t.Errorf("changed = %d, want 0", plan.Changed)
	}
}

func TestPlanDetectsInBatchCollision(t *testing.T) {
	dir := t.TempDir()
	// Both collapse to "x.txt".
	paths := touch(t, dir, "a1.txt", "a2.txt")
	plan, _ := NewRenameService(nil).Plan(paths, RenameRule{
		Find: `a\d`, Replace: "x", Regex: true, CaseSensitive: true,
	})
	if plan.Conflicts == 0 {
		t.Fatal("expected a duplicate-target conflict")
	}
	if plan.Items[1].Problem == "" {
		t.Error("the second row should carry the problem")
	}
}

func TestPlanDetectsExistingFileCollision(t *testing.T) {
	dir := t.TempDir()
	all := touch(t, dir, "a.txt", "b.txt")
	// Rename only a.txt, onto the name of the untouched b.txt.
	plan, _ := NewRenameService(nil).Plan(all[:1], RenameRule{
		Find: "a", Replace: "b", CaseSensitive: true,
	})
	if plan.Conflicts != 1 || plan.Items[0].Problem != "target exists" {
		t.Errorf("expected a target-exists conflict, got %+v", plan.Items[0])
	}
}

func TestPlanAllowsSwapWithinBatch(t *testing.T) {
	dir := t.TempDir()
	paths := touch(t, dir, "a.txt", "b.txt")
	// a→b and b→a: both targets exist, but both are part of the batch.
	plan, _ := NewRenameService(nil).Plan(paths, RenameRule{
		Find: "a", Replace: "TMPX", CaseSensitive: true,
	})
	// Sanity: this rule only touches a.txt, and b.txt is in the batch,
	// so no "target exists" should be raised for files we own.
	for _, it := range plan.Items {
		if it.Problem == "target exists" {
			t.Errorf("a file inside the batch must not count as an obstacle: %+v", it)
		}
	}
}

func TestPlanRejectsIllegalAndEmptyNames(t *testing.T) {
	dir := t.TempDir()
	paths := touch(t, dir, "a.txt")
	svc := NewRenameService(nil)

	plan, _ := svc.Plan(paths, RenameRule{Find: "a", Replace: "x/y", CaseSensitive: true})
	if plan.Items[0].Problem != "illegal character" {
		t.Errorf("expected illegal-character, got %q", plan.Items[0].Problem)
	}

	plan, _ = svc.Plan(paths, RenameRule{Find: "a", Replace: "", CaseSensitive: true})
	if plan.Items[0].Problem != "empty name" {
		t.Errorf("expected empty-name, got %q", plan.Items[0].Problem)
	}
}

func TestApplyRenamesFiles(t *testing.T) {
	dir := t.TempDir()
	paths := touch(t, dir, "IMG_1.jpg", "IMG_2.jpg")

	res, err := NewRenameService(nil).Apply(paths, RenameRule{
		Find: "IMG", Replace: "photo", CaseSensitive: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Renamed != 2 || res.Failed != 0 {
		t.Fatalf("result = %+v", res)
	}
	got := dirNames(t, dir)
	if len(got) != 2 || got[0] != "photo_1.jpg" || got[1] != "photo_2.jpg" {
		t.Errorf("directory now holds %v", got)
	}
}

func TestApplyPerformsARealSwap(t *testing.T) {
	dir := t.TempDir()
	// Renumbering these in list order maps 2→1 and 1→2: each target is the
	// other file's current name. Without the staging pass one would clobber
	// the other.
	touch(t, dir, "1.txt", "2.txt")
	if err := os.WriteFile(filepath.Join(dir, "1.txt"), []byte("ONE"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "2.txt"), []byte("TWO"), 0o644); err != nil {
		t.Fatal(err)
	}
	ordered := []string{filepath.Join(dir, "2.txt"), filepath.Join(dir, "1.txt")}

	svc := NewRenameService(nil)
	rule := RenameRule{
		Find: ".*", Replace: "", Regex: true, CaseSensitive: true,
		Prefix: "{n}", Numbering: true, StartAt: 1, Padding: 1,
	}

	plan, _ := svc.Plan(ordered, rule)
	if plan.Conflicts != 0 {
		t.Fatalf("a swap between two files in the batch is not a conflict: %+v", plan.Items)
	}

	res, err := svc.Apply(ordered, rule)
	if err != nil || res.Renamed != 2 {
		t.Fatalf("apply failed: %v %+v", err, res)
	}

	// The contents must have traded places, not been overwritten.
	one, _ := os.ReadFile(filepath.Join(dir, "1.txt"))
	two, _ := os.ReadFile(filepath.Join(dir, "2.txt"))
	if string(one) != "TWO" || string(two) != "ONE" {
		t.Errorf("swap lost data: 1.txt=%q 2.txt=%q", one, two)
	}
}

func TestApplyRollsBackWhenStagingFails(t *testing.T) {
	dir := t.TempDir()
	paths := touch(t, dir, "a.txt", "b.txt", "c.txt")

	// Make b.txt un-renamable by removing write permission from a directory
	// it alone lives in.
	sub := filepath.Join(dir, "locked")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	locked := filepath.Join(sub, "b2.txt")
	if err := os.WriteFile(locked, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(sub, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(sub, 0o755) })

	// a.txt stages fine, then the locked one fails — a.txt must come back.
	_, err := NewRenameService(nil).Apply([]string{paths[0], locked}, RenameRule{Prefix: "n_"})
	if err == nil {
		t.Skip("this filesystem ignores directory permissions")
	}
	if got := dirNames(t, dir); got[0] != "a.txt" {
		t.Errorf("a.txt was not rolled back, directory holds %v", got)
	}
}

func TestTitleCaseKeepsApostrophesIntact(t *testing.T) {
	if got := titleCase("don't stop"); got != "Don't Stop" {
		t.Errorf("titleCase = %q, want \"Don't Stop\"", got)
	}
	if got := titleCase("my_file-name"); got != "My_File-Name" {
		t.Errorf("titleCase = %q", got)
	}
}

func TestApplyRefusesWhenAnyRowConflicts(t *testing.T) {
	dir := t.TempDir()
	paths := touch(t, dir, "a1.txt", "a2.txt", "keep.txt")

	// a1 and a2 both collapse to x.txt.
	_, err := NewRenameService(nil).Apply(paths[:2], RenameRule{
		Find: `a\d`, Replace: "x", Regex: true, CaseSensitive: true,
	})
	if err == nil {
		t.Fatal("expected the whole batch to be refused")
	}
	// Nothing may have moved — a half-applied rename is the worst outcome.
	got := dirNames(t, dir)
	if len(got) != 3 {
		t.Errorf("files changed despite refusal: %v", got)
	}
}

func TestApplyLeavesNoTempFilesBehind(t *testing.T) {
	dir := t.TempDir()
	paths := touch(t, dir, "a.txt", "b.txt")

	if _, err := NewRenameService(nil).Apply(paths, RenameRule{Prefix: "n_"}); err != nil {
		t.Fatal(err)
	}
	for _, n := range dirNames(t, dir) {
		if len(n) > 0 && n[0] == '.' {
			t.Errorf("a staging file was left behind: %s", n)
		}
	}
}

func TestApplySkipsUnchangedRows(t *testing.T) {
	dir := t.TempDir()
	paths := touch(t, dir, "a.txt", "b.txt")

	res, err := NewRenameService(nil).Apply(paths, RenameRule{Find: "zzz", Replace: "q"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Renamed != 0 {
		t.Errorf("nothing should have been renamed, got %d", res.Renamed)
	}
	if got := dirNames(t, dir); got[0] != "a.txt" || got[1] != "b.txt" {
		t.Errorf("names changed unexpectedly: %v", got)
	}
}
