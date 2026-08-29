package services

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// AIService talks to OpenAI-compatible chat-completion endpoints.
// Cloud: DeepSeek / OpenAI / Qwen / Kimi / GLM / Doubao / custom.
// Local: the common desktop OpenAI-compatible servers, plus a generic CLI.
type AIService struct {
	store   *StoreService
	mu      sync.Mutex
	pending map[string]context.CancelFunc
	client  *http.Client
}

func NewAIService(store *StoreService) *AIService {
	return &AIService{
		store:   store,
		pending: map[string]context.CancelFunc{},
		client:  &http.Client{Timeout: 5 * time.Minute},
	}
}

type AIProvider struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	BaseURL string `json:"baseUrl"`
	Model   string `json:"model"`
	// NoKey is true for local OpenAI-compatible servers (Ollama, LM Studio)
	// that accept an empty or dummy bearer token.
	NoKey bool `json:"noKey"`
}

var aiProviders = []AIProvider{
	{ID: "deepseek", Label: "DeepSeek", BaseURL: "https://api.deepseek.com/v1", Model: "deepseek-chat"},
	{ID: "openai", Label: "OpenAI", BaseURL: "https://api.openai.com/v1", Model: "gpt-4o-mini"},
	{ID: "qwen", Label: "Qwen", BaseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", Model: "qwen-plus"},
	{ID: "moonshot", Label: "Kimi", BaseURL: "https://api.moonshot.cn/v1", Model: "moonshot-v1-auto"},
	{ID: "glm", Label: "GLM", BaseURL: "https://open.bigmodel.cn/api/paas/v4", Model: "glm-4-flash"},
	{ID: "doubao", Label: "Doubao", BaseURL: "https://ark.cn-beijing.volces.com/api/v3", Model: "doubao-pro-32k"},
	{ID: "ollama", Label: "Ollama", BaseURL: "http://127.0.0.1:11434/v1", Model: "llama3.2", NoKey: true},
	{ID: "lmstudio", Label: "LM Studio", BaseURL: "http://127.0.0.1:1234/v1", Model: "", NoKey: true},
	{ID: "llamacpp", Label: "llama.cpp", BaseURL: "http://127.0.0.1:8080/v1", Model: "", NoKey: true},
	{ID: "vllm", Label: "vLLM", BaseURL: "http://127.0.0.1:8000/v1", Model: "", NoKey: true},
	{ID: "mlx", Label: "MLX", BaseURL: "http://127.0.0.1:8080/v1", Model: "", NoKey: true},
	{ID: "jan", Label: "Jan", BaseURL: "http://127.0.0.1:1337/v1", Model: "", NoKey: true},
	{ID: "gpt4all", Label: "GPT4All", BaseURL: "http://127.0.0.1:4891/v1", Model: "", NoKey: true},
	{ID: "localai", Label: "LocalAI", BaseURL: "http://127.0.0.1:8080/v1", Model: "", NoKey: true},
	{ID: "koboldcpp", Label: "KoboldCpp", BaseURL: "http://127.0.0.1:5001/v1", Model: "", NoKey: true},
	{ID: "llamafile", Label: "llamafile", BaseURL: "http://127.0.0.1:8080/v1", Model: "", NoKey: true},
	{ID: "custom", Label: "Custom", BaseURL: "", Model: ""},
	{ID: "cli", Label: "Local CLI", BaseURL: "", Model: ""},
}

func (a *AIService) Providers() []AIProvider {
	return aiProviders
}

type AIConfig struct {
	Platform    string `json:"platform"`
	APIKey      string `json:"apiKey"`
	CustomURL   string `json:"customUrl"`
	CustomModel string `json:"customModel"`
}

// AIProfile is one saved provider configuration, laid out along the usual
// OpenAI-compatible integration fields: base URL, API key, model. Users may
// keep several (say, a work key and a personal key) and mark one as active.
type AIProfile struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Platform string `json:"platform"`
	APIKey   string `json:"apiKey"`
	Model    string `json:"model"`
	// Protocol base URL, e.g. "https://api.deepseek.com/v1". Empty means
	// "the built-in default for Platform"; /chat/completions is appended
	// when a request goes out.
	BaseURL string `json:"baseUrl"`
	// Command is the local CLI invocation when Platform is "cli".
	// `{prompt}` and `{model}` are substituted; if `{prompt}` is absent the
	// conversation is written to stdin.
	Command string `json:"command"`
	// Deprecated: earlier builds stored the full completions URL here.
	// loadProfiles folds it into BaseURL on read; nothing writes it anymore.
	CustomURL string `json:"customUrl,omitempty"`
}

type AIProfileList struct {
	Profiles []AIProfile `json:"profiles"`
	ActiveID string      `json:"activeId"`
}

func providerByID(id string) (AIProvider, bool) {
	for _, p := range aiProviders {
		if p.ID == id {
			return p, true
		}
	}
	return AIProvider{}, false
}

// loadProfiles reads the profile list, migrating the pre-multi-config
// single-setting layout the first time it runs.
func (a *AIService) loadProfiles() ([]AIProfile, string) {
	if a.store == nil {
		return nil, ""
	}
	if raw, err := a.store.GetSetting("ai_profiles"); err == nil && raw != "" {
		var profiles []AIProfile
		if json.Unmarshal([]byte(raw), &profiles) == nil {
			for i := range profiles {
				if profiles[i].BaseURL == "" && profiles[i].CustomURL != "" {
					profiles[i].BaseURL = normalizeBaseURL(profiles[i].CustomURL)
				}
				profiles[i].CustomURL = ""
			}
			active, _ := a.store.GetSetting("ai_active_profile")
			return profiles, active
		}
	}
	// Legacy layout: one flat set of keys. Fold it into a profile so an
	// existing key keeps working after the upgrade.
	key, _ := a.store.GetSetting("ai_api_key")
	if strings.TrimSpace(key) == "" {
		return nil, ""
	}
	platform, _ := a.store.GetSetting("ai_platform")
	if platform == "" {
		platform = "deepseek"
	}
	name := platform
	if prov, ok := providerByID(platform); ok {
		name = prov.Label
	}
	model, _ := a.store.GetSetting("ai_custom_model")
	customURL, _ := a.store.GetSetting("ai_custom_url")
	p := AIProfile{ID: "legacy", Name: name, Platform: platform, APIKey: key, Model: model, BaseURL: normalizeBaseURL(customURL)}
	_ = a.saveProfiles([]AIProfile{p}, p.ID)
	return []AIProfile{p}, p.ID
}

func (a *AIService) saveProfiles(profiles []AIProfile, activeID string) error {
	raw, err := json.Marshal(profiles)
	if err != nil {
		return err
	}
	if err := a.store.SetSetting("ai_profiles", string(raw)); err != nil {
		return err
	}
	return a.store.SetSetting("ai_active_profile", activeID)
}

// GetProfiles returns every saved profile plus the active one's ID.
func (a *AIService) GetProfiles() (AIProfileList, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	profiles, active := a.loadProfiles()
	if profiles == nil {
		profiles = []AIProfile{}
	}
	return AIProfileList{Profiles: profiles, ActiveID: active}, nil
}

// SaveProfile creates or updates a profile; the first one saved becomes active.
func (a *AIService) SaveProfile(p AIProfile) (AIProfileList, error) {
	if a.store == nil {
		return AIProfileList{}, fmt.Errorf("store unavailable")
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	profiles, active := a.loadProfiles()

	p.Name = strings.TrimSpace(p.Name)
	p.Platform = strings.TrimSpace(p.Platform)
	p.APIKey = strings.TrimSpace(p.APIKey)
	p.Model = strings.TrimSpace(p.Model)
	p.Command = strings.TrimSpace(p.Command)
	p.BaseURL = normalizeBaseURL(p.BaseURL)
	p.CustomURL = ""
	if p.Platform == "" {
		p.Platform = "deepseek"
	}
	if p.Platform == "cli" {
		p.APIKey = ""
		p.BaseURL = ""
		if p.Command == "" {
			return AIProfileList{}, fmt.Errorf("a CLI command is required")
		}
	}
	if p.Name == "" {
		if prov, ok := providerByID(p.Platform); ok {
			p.Name = prov.Label
		} else {
			p.Name = p.Platform
		}
	}
	if p.ID == "" {
		p.ID = fmt.Sprintf("p%d", time.Now().UnixNano())
	}

	found := false
	for i := range profiles {
		if profiles[i].ID == p.ID {
			profiles[i] = p
			found = true
			break
		}
	}
	if !found {
		profiles = append(profiles, p)
	}
	if active == "" {
		active = p.ID
	}
	if err := a.saveProfiles(profiles, active); err != nil {
		return AIProfileList{}, err
	}
	return AIProfileList{Profiles: profiles, ActiveID: active}, nil
}

// DeleteProfile removes a profile; if the active one goes, the first
// remaining profile takes over.
func (a *AIService) DeleteProfile(id string) (AIProfileList, error) {
	if a.store == nil {
		return AIProfileList{}, fmt.Errorf("store unavailable")
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	profiles, active := a.loadProfiles()
	kept := profiles[:0]
	for _, p := range profiles {
		if p.ID != id {
			kept = append(kept, p)
		}
	}
	if active == id {
		active = ""
		if len(kept) > 0 {
			active = kept[0].ID
		}
	}
	if err := a.saveProfiles(kept, active); err != nil {
		return AIProfileList{}, err
	}
	return AIProfileList{Profiles: kept, ActiveID: active}, nil
}

// SetActiveProfile marks which profile Chat uses.
func (a *AIService) SetActiveProfile(id string) (AIProfileList, error) {
	if a.store == nil {
		return AIProfileList{}, fmt.Errorf("store unavailable")
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	profiles, _ := a.loadProfiles()
	for _, p := range profiles {
		if p.ID == id {
			if err := a.saveProfiles(profiles, id); err != nil {
				return AIProfileList{}, err
			}
			return AIProfileList{Profiles: profiles, ActiveID: id}, nil
		}
	}
	return AIProfileList{}, fmt.Errorf("profile %q not found", id)
}

// GetConfig flattens the active profile into the legacy single-config shape;
// tools only care whether a key exists.
func (a *AIService) GetConfig() (AIConfig, error) {
	cfg := AIConfig{Platform: "deepseek"}
	a.mu.Lock()
	profiles, active := a.loadProfiles()
	a.mu.Unlock()
	for _, p := range profiles {
		if p.ID == active {
			key := p.APIKey
			if p.Platform == "cli" && p.Command != "" {
				key = "cli"
			} else if keylessHTTP(&p) {
				key = "local"
			}
			return AIConfig{Platform: p.Platform, APIKey: key, CustomURL: p.BaseURL, CustomModel: p.Model}, nil
		}
	}
	return cfg, nil
}

// SetConfig writes through to the active profile (legacy single-config path).
func (a *AIService) SetConfig(cfg AIConfig) error {
	_, err := a.SaveProfile(AIProfile{
		ID:       activeProfileID(a),
		Platform: cfg.Platform,
		APIKey:   cfg.APIKey,
		Model:    cfg.CustomModel,
		BaseURL:  cfg.CustomURL,
	})
	return err
}

func activeProfileID(a *AIService) string {
	_, active := a.loadProfiles()
	return active
}

func (a *AIService) resolveEndpoint() (url, model, key string, err error) {
	p, err := a.activeProfile()
	if err != nil {
		return "", "", "", err
	}
	return endpointFor(p)
}

func (a *AIService) activeProfile() (*AIProfile, error) {
	a.mu.Lock()
	profiles, active := a.loadProfiles()
	a.mu.Unlock()
	for i := range profiles {
		if profiles[i].ID == active {
			p := profiles[i]
			return &p, nil
		}
	}
	return nil, fmt.Errorf("no API key configured")
}

func isCLI(p *AIProfile) bool {
	return p != nil && p.Platform == "cli"
}

// resolveHTTP fills base URL, model and bearer token from a profile (or its
// provider defaults). Local NoKey servers may omit the model until the user
// picks one; chat still requires a model via endpointFor.
func resolveHTTP(p *AIProfile) (base, model, key string, err error) {
	if p == nil {
		return "", "", "", fmt.Errorf("no API key configured")
	}
	base = normalizeBaseURL(p.BaseURL)
	model = strings.TrimSpace(p.Model)
	if prov, ok := providerByID(p.Platform); ok {
		if base == "" {
			base = prov.BaseURL
		}
		if model == "" {
			model = prov.Model
		}
	}
	if !keylessHTTP(p) && strings.TrimSpace(p.APIKey) == "" {
		return "", "", "", fmt.Errorf("no API key configured")
	}
	if base == "" {
		return "", "", "", fmt.Errorf("a base URL is required")
	}
	key = strings.TrimSpace(p.APIKey)
	if key == "" {
		key = "local"
	}
	return base, model, key, nil
}

// endpointFor resolves one profile — possibly an unsaved draft — to a
// concrete endpoint, so the test button works before anything is saved.
// Fields follow the OpenAI-compatible integration convention: a base URL
// (falling back to the protocol's built-in default) plus "/chat/completions".
func endpointFor(p *AIProfile) (url, model, key string, err error) {
	base, model, key, err := resolveHTTP(p)
	if err != nil {
		return "", "", "", err
	}
	if model == "" {
		return "", "", "", fmt.Errorf("a model is required")
	}
	return base + "/chat/completions", model, key, nil
}

func keylessHTTP(p *AIProfile) bool {
	if p == nil {
		return false
	}
	if prov, ok := providerByID(p.Platform); ok && prov.NoKey {
		return true
	}
	base := strings.ToLower(normalizeBaseURL(p.BaseURL))
	return strings.Contains(base, "127.0.0.1") || strings.Contains(base, "localhost")
}

// normalizeBaseURL trims slashes and accepts pasted full endpoints, so both
// "https://api.x.com/v1" and "https://api.x.com/v1/chat/completions" work.
func normalizeBaseURL(u string) string {
	u = strings.TrimSpace(u)
	u = strings.TrimRight(u, "/")
	u = strings.TrimSuffix(u, "/chat/completions")
	return strings.TrimRight(u, "/")
}

// TestProfile fires a one-shot completion at a (possibly unsaved) profile and
// reports the model and latency, so a bad key or URL surfaces here instead of
// mid-conversation in an AI tool.
func (a *AIService) TestProfile(p AIProfile) (string, error) {
	if isCLI(&p) {
		return a.testCLI(&p)
	}
	url, model, key, err := endpointFor(&p)
	if err != nil {
		return "", err
	}
	body, err := json.Marshal(map[string]any{
		"model":    model,
		"messages": []ChatMessage{{Role: "user", Content: "hi"}},
		"stream":   false,
	})
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)
	start := time.Now()
	resp, err := a.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("%s", parseAPIError(resp.StatusCode, data))
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64*1024))
	return fmt.Sprintf("%s · %dms", model, time.Since(start).Milliseconds()), nil
}

// FetchModels asks the provider for its model list via the OpenAI-compatible
// /models endpoint, feeding the editor's suggestions.
func (a *AIService) FetchModels(p AIProfile) ([]string, error) {
	if isCLI(&p) {
		return a.fetchCLIModels(&p)
	}
	base, _, key, err := resolveHTTP(&p)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(base, "/")+"/models", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	resp, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("%s", parseAPIError(resp.StatusCode, data))
	}
	var list struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&list); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(list.Data))
	for _, m := range list.Data {
		if m.ID != "" {
			ids = append(ids, m.ID)
		}
	}
	return ids, nil
}

// modelsURLFor turns a chat-completions URL into its sibling /models URL;
// custom endpoints that skip "/chat/completions" just get "/models" appended.
func modelsURLFor(chatURL string) string {
	if i := strings.Index(chatURL, "/chat/completions"); i > 0 {
		return chatURL[:i] + "/models"
	}
	return strings.TrimRight(chatURL, "/") + "/models"
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type AIStreamChunk struct {
	ID    string `json:"id"`
	Delta string `json:"delta"`
	Done  bool   `json:"done"`
	Error string `json:"error,omitempty"`
}

func emitAIChunk(c AIStreamChunk) {
	if app := application.Get(); app != nil {
		app.Event.Emit("ai-stream", c)
	}
}

// CancelChat aborts a streaming request previously started with Chat.
func (a *AIService) CancelChat(requestID string) {
	a.mu.Lock()
	cancel := a.pending[requestID]
	delete(a.pending, requestID)
	a.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

// Chat streams a completion; deltas arrive as "ai-stream" events tagged with
// requestID, and the final full text is returned.
func (a *AIService) Chat(requestID string, messages []ChatMessage, temperature float64) (string, error) {
	p, err := a.activeProfile()
	if err != nil {
		return "", err
	}
	if isCLI(p) {
		return a.chatCLI(requestID, p, messages)
	}
	url, model, key, err := endpointFor(p)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.mu.Lock()
	a.pending[requestID] = cancel
	a.mu.Unlock()
	defer func() {
		a.mu.Lock()
		delete(a.pending, requestID)
		a.mu.Unlock()
		cancel()
	}()

	payload := map[string]any{
		"model":       model,
		"messages":    messages,
		"stream":      true,
		"temperature": temperature,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := a.client.Do(req)
	if err != nil {
		emitAIChunk(AIStreamChunk{ID: requestID, Done: true, Error: err.Error()})
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		msg := parseAPIError(resp.StatusCode, data)
		emitAIChunk(AIStreamChunk{ID: requestID, Done: true, Error: msg})
		return "", fmt.Errorf("%s", msg)
	}

	var full strings.Builder
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			delta := chunk.Choices[0].Delta.Content
			full.WriteString(delta)
			emitAIChunk(AIStreamChunk{ID: requestID, Delta: delta})
		}
	}
	if err := scanner.Err(); err != nil && ctx.Err() == nil {
		emitAIChunk(AIStreamChunk{ID: requestID, Done: true, Error: err.Error()})
		return full.String(), err
	}
	emitAIChunk(AIStreamChunk{ID: requestID, Done: true})
	if a.store != nil {
		_ = a.store.AddHistory("ai-chat", fmt.Sprintf("%d chars", full.Len()))
	}
	return full.String(), nil
}

func parseAPIError(status int, data []byte) string {
	var e struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(data, &e); err == nil && e.Error.Message != "" {
		return fmt.Sprintf("HTTP %d: %s", status, e.Error.Message)
	}
	return fmt.Sprintf("HTTP %d: %s", status, strings.TrimSpace(string(data)))
}
