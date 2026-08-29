package main

import (
	"embed"
	"encoding/json"
	"log"
	"time"

	"hitool/services"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

// All files in frontend/dist are embedded into the binary and served
// to the webview by the asset server.
//
//go:embed all:frontend/dist
var assets embed.FS

const windowStateKey = "layout.window"

// windowState remembers where the user left the window so the app reopens
// exactly as it was closed.
type windowState struct {
	W int `json:"w"`
	H int `json:"h"`
	X int `json:"x"`
	Y int `json:"y"`
}

func loadWindowState(store *services.StoreService) (windowState, bool) {
	raw, err := store.GetSetting(windowStateKey)
	if err != nil || raw == "" {
		return windowState{}, false
	}
	var ws windowState
	if err := json.Unmarshal([]byte(raw), &ws); err != nil {
		return windowState{}, false
	}
	// Ignore stale states smaller than the minimum — restoring them would
	// fight the min-size constraints.
	if ws.W < 860 || ws.H < 560 {
		return windowState{}, false
	}
	return ws, true
}

func init() {
	// Registering event payload types gives the binding generator
	// strongly-typed JS/TS event APIs.
	application.RegisterEvent[services.ConvertProgress]("convert-progress")
	application.RegisterEvent[services.AIStreamChunk]("ai-stream")
	application.RegisterEvent[services.FilesDropped]("files-dropped")
}

func main() {
	store := services.NewStoreService()

	app := application.New(application.Options{
		Name:        "HiTool",
		Description: "多功能本地工具箱 — Go + Wails3 + Vue 构建",
		Services: []application.Service{
			application.NewService(store),
			application.NewService(services.NewSystemService()),
			application.NewService(services.NewPDFService(store)),
			application.NewService(services.NewImageService(store)),
			application.NewService(services.NewAIService(store)),
			application.NewService(services.NewHashService(store)),
			application.NewService(services.NewQRService(store)),
			application.NewService(services.NewRenameService(store)),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	// Auto-update: app.Updater is created by application.New; configure it
	// against the project's GitHub releases. HitoolAssetMatcher picks the
	// installable artifact per platform (darwin zip / windows portable exe /
	// linux AppImage). The UpdateService exposes Check / DownloadAndInstall
	// to the frontend via generated bindings.
	if gh, err := github.New(github.Config{
		Repository:   "sayhia/hitool",
		AssetMatcher: services.HitoolAssetMatcher,
	}); err == nil {
		_ = app.Updater.Init(updater.Config{
			CurrentVersion: services.Version,
			Providers:      []updater.Provider{gh},
		})
		app.RegisterService(application.NewService(services.NewUpdateService(app.Updater)))
	}

	winOpts := application.WebviewWindowOptions{
		Title:     "HiTool",
		Width:     1280,
		Height:    820,
		MinWidth:  860,
		MinHeight: 560,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 38,
			Backdrop:                application.MacBackdropNormal,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		// Matches the v0.5 light chrome ground so there is no colour pop
		// between window creation and the first frame.
		BackgroundColour: application.NewRGB(236, 236, 240),
		EnableFileDrop:   true,
		URL:              "/",
	}
	if ws, ok := loadWindowState(store); ok {
		winOpts.Width, winOpts.Height = ws.W, ws.H
		winOpts.X, winOpts.Y = ws.X, ws.Y
		winOpts.InitialPosition = application.WindowXY
	}
	win := app.Window.NewWithOptions(winOpts)

	// Persist size/position on move and resize, throttled so dragging the
	// window around doesn't hammer SQLite; a final write lands on close.
	var lastSave time.Time
	saveWindowState := func(force bool) {
		if !force && time.Since(lastSave) < 400*time.Millisecond {
			return
		}
		lastSave = time.Now()
		w, h := win.Size()
		x, y := win.Position()
		raw, err := json.Marshal(windowState{W: w, H: h, X: x, Y: y})
		if err != nil {
			return
		}
		_ = store.SetSetting(windowStateKey, string(raw))
	}
	win.OnWindowEvent(events.Common.WindowDidMove, func(*application.WindowEvent) {
		saveWindowState(false)
	})
	win.OnWindowEvent(events.Common.WindowDidResize, func(*application.WindowEvent) {
		saveWindowState(false)
	})
	win.OnWindowEvent(events.Common.WindowClosing, func(*application.WindowEvent) {
		saveWindowState(true)
	})

	// Native drag-and-drop: forward dropped paths (already stat'ed) to the
	// frontend, tagged with the data-file-drop-target value of the element
	// they landed on so the UI can route them to the right tray.
	win.OnWindowEvent(events.Common.WindowFilesDropped, func(e *application.WindowEvent) {
		zone := ""
		if target := e.Context().DropTargetDetails(); target != nil {
			zone = target.Attributes["data-file-drop-target"]
			if zone == "" {
				zone = target.ElementID
			}
		}
		app.Event.Emit("files-dropped", services.FilesDropped{
			Zone:  zone,
			Files: services.StatPaths(e.Context().DroppedFiles()),
		})
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
