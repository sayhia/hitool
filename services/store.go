package services

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// StoreService persists settings, favorites and usage history in SQLite.
type StoreService struct {
	mu sync.Mutex
	db *sql.DB
}

type HistoryItem struct {
	ID        int64  `json:"id"`
	Tool      string `json:"tool"`
	Detail    string `json:"detail"`
	CreatedAt string `json:"createdAt"`
}

func NewStoreService() *StoreService {
	return &StoreService{}
}

// DataDir returns the per-user data directory for hitool.
// HITOOL_DATA_DIR overrides it, which is how tests stay off the real database
// (os.UserConfigDir ignores XDG_CONFIG_HOME on macOS).
func DataDir() string {
	if override := os.Getenv("HITOOL_DATA_DIR"); override != "" {
		_ = os.MkdirAll(override, 0o755)
		return override
	}
	base, err := os.UserConfigDir()
	if err != nil {
		home, _ := os.UserHomeDir()
		base = filepath.Join(home, ".config")
	}
	dir := filepath.Join(base, "HiTool")
	_ = os.MkdirAll(dir, 0o755)
	return dir
}

func (s *StoreService) init() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db != nil {
		return nil
	}
	dbPath := filepath.Join(DataDir(), "hitool.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	schema := `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS favorites (
  tool       TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tool       TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_history_created ON history(created_at DESC);
`
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return fmt.Errorf("init schema: %w", err)
	}
	s.db = db
	return nil
}

func (s *StoreService) conn() (*sql.DB, error) {
	if err := s.init(); err != nil {
		return nil, err
	}
	return s.db, nil
}

// GetSetting returns the stored value for key, or "" when unset.
func (s *StoreService) GetSetting(key string) (string, error) {
	db, err := s.conn()
	if err != nil {
		return "", err
	}
	var v string
	err = db.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&v)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return v, err
}

func (s *StoreService) SetSetting(key, value string) error {
	db, err := s.conn()
	if err != nil {
		return err
	}
	_, err = db.Exec(`INSERT INTO settings(key, value) VALUES(?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

func (s *StoreService) GetAllSettings() (map[string]string, error) {
	db, err := s.conn()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(`SELECT key, value FROM settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}

// ToggleFavorite flips the favorite state for a tool and returns the new state.
func (s *StoreService) ToggleFavorite(tool string) (bool, error) {
	db, err := s.conn()
	if err != nil {
		return false, err
	}
	res, err := db.Exec(`DELETE FROM favorites WHERE tool = ?`, tool)
	if err != nil {
		return false, err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return false, nil
	}
	_, err = db.Exec(`INSERT INTO favorites(tool) VALUES(?)`, tool)
	return err == nil, err
}

func (s *StoreService) GetFavorites() ([]string, error) {
	db, err := s.conn()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(`SELECT tool FROM favorites ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// AddHistory records one tool usage; keeps the most recent 500 entries.
func (s *StoreService) AddHistory(tool, detail string) error {
	db, err := s.conn()
	if err != nil {
		return err
	}
	if _, err := db.Exec(`INSERT INTO history(tool, detail, created_at) VALUES(?, ?, ?)`,
		tool, detail, time.Now().Format("2006-01-02 15:04:05")); err != nil {
		return err
	}
	_, err = db.Exec(`DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 500)`)
	return err
}

func (s *StoreService) GetHistory(limit int) ([]HistoryItem, error) {
	db, err := s.conn()
	if err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := db.Query(`SELECT id, tool, detail, created_at FROM history ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []HistoryItem{}
	for rows.Next() {
		var it HistoryItem
		if err := rows.Scan(&it.ID, &it.Tool, &it.Detail, &it.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (s *StoreService) ClearHistory() error {
	db, err := s.conn()
	if err != nil {
		return err
	}
	_, err = db.Exec(`DELETE FROM history`)
	return err
}

// RemoveHistoryByTool drops every record of one tool, so the recently-used
// row for it can be dismissed without touching the rest of the log.
func (s *StoreService) RemoveHistoryByTool(tool string) error {
	db, err := s.conn()
	if err != nil {
		return err
	}
	_, err = db.Exec(`DELETE FROM history WHERE tool = ?`, tool)
	return err
}
