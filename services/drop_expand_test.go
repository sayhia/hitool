package services

import (
	"os"
	"path/filepath"
	"testing"
)

// makeTree lays out a small folder tree: files at two levels, a hidden file
// and a hidden dir that must both be skipped.
func makeTree(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	write := func(rel, body string) {
		full := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("a.txt", "a")
	write("sub/b.png", "bb")
	write("sub/deep/c.jpg", "ccc")
	write(".hidden", "x")
	write(".cache/d.txt", "x")
	return root
}

func TestStatPathsExpandsFolders(t *testing.T) {
	root := makeTree(t)
	got := StatPaths([]string{root})
	var names []string
	for _, f := range got {
		names = append(names, f.Name)
	}
	// a.txt, sub/b.png and sub/deep/c.jpg — hidden entries are skipped.
	want := []string{"a.txt", "b.png", "c.jpg"}
	if len(names) != len(want) {
		t.Fatalf("got %v, want %v", names, want)
	}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("got %v, want %v", names, want)
		}
	}
}

func TestStatPathsMixedFilesAndFolders(t *testing.T) {
	root := makeTree(t)
	standalone := filepath.Join(t.TempDir(), "solo.txt")
	if err := os.WriteFile(standalone, []byte("s"), 0o644); err != nil {
		t.Fatal(err)
	}
	got := StatPaths([]string{standalone, root})
	if len(got) != 4 {
		t.Fatalf("got %d entries, want 4", len(got))
	}
	if got[0].Name != "solo.txt" {
		t.Fatalf("first entry should be the standalone file, got %s", got[0].Name)
	}
}

func TestStatPathsCapsFileCount(t *testing.T) {
	root := t.TempDir()
	for i := 0; i < maxDropFiles+50; i++ {
		p := filepath.Join(root, "f"+string(rune('a'+i%26))+string(rune('0'+i/26))+".txt")
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	got := StatPaths([]string{root})
	if len(got) > maxDropFiles {
		t.Fatalf("got %d entries, want at most %d", len(got), maxDropFiles)
	}
}

func TestStatPathsDepthLimit(t *testing.T) {
	root := t.TempDir()
	deep := filepath.Join(root, "l1", "l2", "l3", "l4")
	if err := os.MkdirAll(deep, 0o755); err != nil {
		t.Fatal(err)
	}
	// One file inside the depth limit and one beyond it.
	if err := os.WriteFile(filepath.Join(root, "l1", "in.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(deep, "too-deep.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	got := StatPaths([]string{root})
	if len(got) != 1 || got[0].Name != "in.txt" {
		t.Fatalf("got %+v, want only in.txt", got)
	}
}
