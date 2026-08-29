package services

import (
	"reflect"
	"strings"
	"testing"
)

func TestModelsURLFor(t *testing.T) {
	cases := map[string]string{
		"https://api.deepseek.com/v1/chat/completions":        "https://api.deepseek.com/v1/models",
		"https://api.example.com/v1/chat/completions?x=1":     "https://api.example.com/v1/models",
		"https://proxy.example.com/v1":                        "https://proxy.example.com/v1/models",
		"https://proxy.example.com/v1/":                       "https://proxy.example.com/v1/models",
	}
	for in, want := range cases {
		if got := modelsURLFor(in); got != want {
			t.Errorf("modelsURLFor(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNormalizeBaseURL(t *testing.T) {
	cases := map[string]string{
		"https://api.x.com/v1":                    "https://api.x.com/v1",
		"https://api.x.com/v1/":                   "https://api.x.com/v1",
		"https://api.x.com/v1/chat/completions":   "https://api.x.com/v1",
		"https://api.x.com/v1/chat/completions//": "https://api.x.com/v1",
		"  https://proxy.local/v1  ":               "https://proxy.local/v1",
		"": "",
	}
	for in, want := range cases {
		if got := normalizeBaseURL(in); got != want {
			t.Errorf("normalizeBaseURL(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestEndpointFor(t *testing.T) {
	if _, _, _, err := endpointFor(nil); err == nil {
		t.Error("nil profile should fail")
	}
	if _, _, _, err := endpointFor(&AIProfile{Platform: "deepseek"}); err == nil {
		t.Error("missing key should fail")
	}
	if _, _, _, err := endpointFor(&AIProfile{Platform: "custom", APIKey: "k"}); err == nil {
		t.Error("custom without base URL/model should fail")
	}
	// Known provider: default base URL + /chat/completions, default model.
	url, model, _, err := endpointFor(&AIProfile{Platform: "deepseek", APIKey: "k"})
	if err != nil || url != "https://api.deepseek.com/v1/chat/completions" || model != "deepseek-chat" {
		t.Errorf("deepseek default = %q %q %v", url, model, err)
	}
	// Model override honoured.
	_, model, _, _ = endpointFor(&AIProfile{Platform: "deepseek", APIKey: "k", Model: "deepseek-reasoner"})
	if model != "deepseek-reasoner" {
		t.Errorf("model override = %q", model)
	}
	// Base URL override (proxy/relay), full pasted endpoint accepted.
	url, _, _, err = endpointFor(&AIProfile{Platform: "deepseek", APIKey: "k", BaseURL: "https://proxy.local/v1/chat/completions"})
	if err != nil || url != "https://proxy.local/v1/chat/completions" {
		t.Errorf("base override = %q %v", url, err)
	}
	// Custom protocol: user-supplied base URL and model pass through.
	url, model, _, err = endpointFor(&AIProfile{Platform: "custom", APIKey: "k", BaseURL: "http://x/v1", Model: "m"})
	if err != nil || url != "http://x/v1/chat/completions" || model != "m" {
		t.Errorf("custom = %q %q %v", url, model, err)
	}
	// Local HTTP servers (Ollama) don't need a key.
	url, model, key, err := endpointFor(&AIProfile{Platform: "ollama"})
	if err != nil || !strings.Contains(url, "11434") || model != "llama3.2" || key != "local" {
		t.Errorf("ollama = %q %q %q %v", url, model, key, err)
	}
	// Other local servers also skip the key; model still has to be set.
	url, model, key, err = endpointFor(&AIProfile{Platform: "lmstudio", Model: "qwen2.5"})
	if err != nil || !strings.Contains(url, "1234") || model != "qwen2.5" || key != "local" {
		t.Errorf("lmstudio = %q %q %q %v", url, model, key, err)
	}
	if _, _, _, err := endpointFor(&AIProfile{Platform: "lmstudio"}); err == nil {
		t.Error("local HTTP without a model should fail")
	}
	base, model, key, err := resolveHTTP(&AIProfile{Platform: "lmstudio"})
	if err != nil || !strings.Contains(base, "1234") || model != "" || key != "local" {
		t.Errorf("resolveHTTP lmstudio = %q %q %q %v", base, model, key, err)
	}
}

func TestLocalProviders(t *testing.T) {
	want := []string{"ollama", "lmstudio", "llamacpp", "vllm", "mlx", "jan", "gpt4all", "localai", "koboldcpp", "llamafile"}
	var got []string
	for _, p := range aiProviders {
		if !p.NoKey {
			continue
		}
		got = append(got, p.ID)
		if !strings.Contains(p.BaseURL, "127.0.0.1") {
			t.Errorf("%s missing localhost base: %s", p.ID, p.BaseURL)
		}
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("local providers = %v, want %v", got, want)
	}
}

func TestDetectCLIAgents(t *testing.T) {
	svc := &AIService{}
	got := svc.DetectCLIAgents()
	if len(got) != len(cliAgentDefs) {
		t.Fatalf("len = %d, want %d", len(got), len(cliAgentDefs))
	}
	need := []string{"claude", "codex", "cursor", "gemini", "copilot", "opencode", "qwen", "grok", "kimi", "aider"}
	seen := map[string]bool{}
	for _, a := range got {
		seen[a.ID] = true
		if a.Label == "" || a.Command == "" || a.Tagline == "" {
			t.Errorf("%s missing label/command/tagline: %+v", a.ID, a)
		}
	}
	for _, id := range need {
		if !seen[id] {
			t.Errorf("missing agent %s", id)
		}
	}
	if matchAgentDef("claude") == nil || matchAgentDef("/opt/homebrew/bin/codex") == nil {
		t.Fatal("matchAgentDef should recognise known bins")
	}
	def := matchAgentDef("claude")
	if !commandMatchesDef([]string{"claude", "-p", "--output-format", "text"}, def) {
		t.Fatal("template should match claude def")
	}
	if commandMatchesDef([]string{"claude", "-p", "{prompt}"}, def) {
		t.Fatal("custom claude command should not use the canned argv")
	}
}

func TestSplitCLI(t *testing.T) {
	got, err := splitCLI(`ollama run llama3.2`)
	if err != nil || !reflect.DeepEqual(got, []string{"ollama", "run", "llama3.2"}) {
		t.Errorf("simple = %v %v", got, err)
	}
	got, err = splitCLI(`claude -p "{prompt}"`)
	if err != nil || !reflect.DeepEqual(got, []string{"claude", "-p", "{prompt}"}) {
		t.Errorf("quoted = %v %v", got, err)
	}
	if _, err := splitCLI(`echo "oops`); err == nil {
		t.Error("unclosed quote should fail")
	}
}

func TestFlattenMessages(t *testing.T) {
	got := flattenMessages([]ChatMessage{
		{Role: "system", Content: "be brief"},
		{Role: "user", Content: "hi"},
	})
	want := "System:\nbe brief\n\nUser:\nhi"
	if got != want {
		t.Errorf("flatten = %q", got)
	}
}

func TestIsCLI(t *testing.T) {
	if isCLI(nil) || isCLI(&AIProfile{Platform: "deepseek"}) {
		t.Fatal("http profiles are not CLI")
	}
	if !isCLI(&AIProfile{Platform: "cli"}) {
		t.Fatal("cli platform")
	}
}
