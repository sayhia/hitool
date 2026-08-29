package services

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
	"unicode"
)

// CLIAgent is one coding-agent CLI the settings picker can offer, the same
// "scan PATH, pick what you already have" shape OpenDesign uses.
type CLIAgent struct {
	ID         string `json:"id"`
	Label      string `json:"label"`
	Tagline    string `json:"tagline"`
	Bin        string `json:"bin"`
	Command    string `json:"command"`
	Installed  bool   `json:"installed"`
	Path       string `json:"path"`
	Version    string `json:"version"`
	InstallURL string `json:"installUrl"`
}

type cliPromptMode int

const (
	cliPromptStdin cliPromptMode = iota
	cliPromptArg
	cliPromptFile
)

type cliAgentDef struct {
	id         string
	label      string
	tagline    string
	bins       []string
	args       []string
	modelFlag  string
	prompt     cliPromptMode
	fileFlag   string
	installURL string
}

// Common local coding-agent CLIs. Invocation is print/one-shot: HiTool tools
// want a text reply, not an interactive coding session.
var cliAgentDefs = []cliAgentDef{
	{id: "claude", label: "Claude Code", tagline: "Anthropic official CLI", bins: []string{"claude", "openclaude"}, args: []string{"-p", "--output-format", "text"}, modelFlag: "--model", prompt: cliPromptStdin, installURL: "https://docs.anthropic.com/en/docs/claude-code"},
	{id: "codex", label: "Codex", tagline: "OpenAI official CLI", bins: []string{"codex"}, args: []string{"exec", "--skip-git-repo-check"}, modelFlag: "--model", prompt: cliPromptStdin, installURL: "https://github.com/openai/codex"},
	{id: "cursor", label: "Cursor Agent", tagline: "Cursor command line", bins: []string{"cursor-agent"}, args: []string{"--print", "--force"}, modelFlag: "--model", prompt: cliPromptStdin, installURL: "https://cursor.com"},
	{id: "gemini", label: "Gemini CLI", tagline: "Google Gemini CLI", bins: []string{"gemini"}, args: []string{"--yolo"}, modelFlag: "--model", prompt: cliPromptStdin, installURL: "https://github.com/google-gemini/gemini-cli"},
	{id: "copilot", label: "GitHub Copilot", tagline: "GitHub coding CLI", bins: []string{"copilot"}, args: []string{"-p"}, modelFlag: "--model", prompt: cliPromptStdin, installURL: "https://docs.github.com/en/copilot"},
	{id: "opencode", label: "OpenCode", tagline: "Open-source agent CLI", bins: []string{"opencode", "opencode-cli"}, args: []string{"run"}, modelFlag: "-m", prompt: cliPromptStdin, installURL: "https://opencode.ai"},
	{id: "qwen", label: "Qwen Code", tagline: "Qwen coding CLI", bins: []string{"qwen"}, args: []string{"--yolo"}, modelFlag: "--model", prompt: cliPromptStdin, installURL: "https://github.com/QwenLM/qwen-code"},
	{id: "grok", label: "Grok", tagline: "xAI coding CLI", bins: []string{"grok"}, args: []string{"--no-plan", "--always-approve"}, modelFlag: "--model", prompt: cliPromptFile, fileFlag: "--prompt-file", installURL: "https://x.ai/cli"},
	{id: "kimi", label: "Kimi CLI", tagline: "Moonshot Kimi CLI", bins: []string{"kimi"}, args: []string{}, modelFlag: "--model", prompt: cliPromptStdin, installURL: "https://www.kimi.com"},
	{id: "qoder", label: "Qoder CLI", tagline: "Alibaba coding CLI", bins: []string{"qodercli", "qoder"}, args: []string{}, modelFlag: "--model", prompt: cliPromptStdin, installURL: "https://qoder.com"},
	{id: "pi", label: "Pi", tagline: "Inflection chat CLI", bins: []string{"pi"}, args: []string{}, modelFlag: "--model", prompt: cliPromptStdin},
	{id: "kiro", label: "Kiro CLI", tagline: "Kiro agent CLI", bins: []string{"kiro-cli", "kiro"}, args: []string{}, modelFlag: "--model", prompt: cliPromptStdin},
	{id: "kilo", label: "Kilo", tagline: "Kilo Code CLI", bins: []string{"kilo"}, args: []string{}, modelFlag: "--model", prompt: cliPromptStdin},
	{id: "vibe", label: "Mistral Vibe", tagline: "Mistral open-source CLI", bins: []string{"vibe-acp", "vibe"}, args: []string{}, modelFlag: "--model", prompt: cliPromptStdin},
	{id: "deepseek", label: "DeepSeek TUI", tagline: "DeepSeek terminal UI", bins: []string{"deepseek", "codewhale"}, args: []string{"exec", "--auto"}, modelFlag: "--model", prompt: cliPromptArg, installURL: "https://www.deepseek.com"},
	{id: "dsh", label: "DeepSeek Harness", tagline: "DeepSeek Harness CLI", bins: []string{"dsh"}, args: []string{}, modelFlag: "--model", prompt: cliPromptStdin},
	{id: "reasonix", label: "Reasonix", tagline: "DeepSeek native coding CLI", bins: []string{"reasonix", "dsnix"}, args: []string{}, modelFlag: "--model", prompt: cliPromptStdin, installURL: "https://github.com/esengine/DeepSeek-Reasonix"},
	{id: "antigravity", label: "Antigravity", tagline: "Google Antigravity CLI", bins: []string{"agy"}, args: []string{"-p"}, modelFlag: "--model", prompt: cliPromptStdin, installURL: "https://antigravity.google/cli"},
	{id: "codebuddy", label: "CodeBuddy", tagline: "Tencent coding CLI", bins: []string{"codebuddy", "cbc"}, args: []string{}, modelFlag: "--model", prompt: cliPromptStdin, installURL: "https://www.codebuddy.cn"},
	{id: "mimo", label: "MiMo Code", tagline: "Xiaomi coding CLI", bins: []string{"mimo"}, args: []string{}, modelFlag: "--model", prompt: cliPromptStdin},
	{id: "atomcode", label: "AtomCode", tagline: "AtomGit coding CLI", bins: []string{"atomcode"}, args: []string{}, modelFlag: "--model", prompt: cliPromptStdin, installURL: "https://atomcode.atomgit.com"},
	{id: "hermes", label: "Hermes", tagline: "ACP agent CLI", bins: []string{"hermes"}, args: []string{}, modelFlag: "--model", prompt: cliPromptStdin},
	{id: "trae", label: "Trae CLI", tagline: "ByteDance Trae CLI", bins: []string{"traecli", "trae"}, args: []string{}, modelFlag: "--model", prompt: cliPromptStdin},
	{id: "amp", label: "Amp", tagline: "Sourcegraph Amp CLI", bins: []string{"amp"}, args: []string{}, modelFlag: "--model", prompt: cliPromptStdin},
	{id: "devin", label: "Devin", tagline: "Cognition terminal CLI", bins: []string{"devin"}, args: []string{}, modelFlag: "--model", prompt: cliPromptStdin},
	{id: "aider", label: "Aider", tagline: "Open-source pair programmer", bins: []string{"aider"}, args: []string{"--yes-always", "--no-pretty", "--no-git", "--no-auto-commits"}, modelFlag: "--model", prompt: cliPromptArg, installURL: "https://aider.chat/docs/install.html"},
}

func (d cliAgentDef) commandTemplate() string {
	return strings.TrimSpace(d.bins[0] + " " + strings.Join(d.args, " "))
}

// DetectCLIAgents scans PATH (plus common toolchain dirs) for known coding
// agents so the settings UI can list what is already installed.
func (a *AIService) DetectCLIAgents() []CLIAgent {
	out := make([]CLIAgent, 0, len(cliAgentDefs))
	for _, d := range cliAgentDefs {
		ag := CLIAgent{
			ID:         d.id,
			Label:      d.label,
			Tagline:    d.tagline,
			Bin:        d.bins[0],
			Command:    d.commandTemplate(),
			InstallURL: d.installURL,
		}
		for _, bin := range d.bins {
			path, err := lookupBin(bin)
			if err != nil {
				continue
			}
			ag.Installed = true
			ag.Bin = bin
			ag.Path = path
			ag.Version = probeCLIVersion(path)
			break
		}
		out = append(out, ag)
	}
	return out
}

func probeCLIVersion(bin string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, bin, "--version").CombinedOutput()
	if err != nil {
		return ""
	}
	line := strings.TrimSpace(strings.SplitN(string(out), "\n", 2)[0])
	if len(line) > 80 {
		line = line[:80]
	}
	return line
}

func matchAgentDef(bin string) *cliAgentDef {
	base := strings.ToLower(filepath.Base(bin))
	base = strings.TrimSuffix(base, ".exe")
	for i := range cliAgentDefs {
		for _, b := range cliAgentDefs[i].bins {
			if strings.EqualFold(b, base) {
				return &cliAgentDefs[i]
			}
		}
	}
	return nil
}

func commandMatchesDef(parts []string, def *cliAgentDef) bool {
	if len(parts) == 0 {
		return false
	}
	got := parts[1:]
	if len(got) == 0 {
		return true
	}
	if len(got) != len(def.args) {
		return false
	}
	for i := range got {
		if got[i] != def.args[i] {
			return false
		}
	}
	return true
}

func (a *AIService) chatCLI(requestID string, p *AIProfile, messages []ChatMessage) (string, error) {
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

	cmd, stdin, cleanup, err := buildCLICmd(ctx, p, flattenMessages(messages))
	if cleanup != nil {
		defer cleanup()
	}
	if err != nil {
		emitAIChunk(AIStreamChunk{ID: requestID, Done: true, Error: err.Error()})
		return "", err
	}

	var stderr bytes.Buffer
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		emitAIChunk(AIStreamChunk{ID: requestID, Done: true, Error: err.Error()})
		return "", err
	}
	cmd.Stderr = &stderr
	if stdin != "" {
		cmd.Stdin = strings.NewReader(stdin)
	}
	if err := cmd.Start(); err != nil {
		emitAIChunk(AIStreamChunk{ID: requestID, Done: true, Error: err.Error()})
		return "", err
	}

	var full strings.Builder
	buf := make([]byte, 512)
	for {
		n, readErr := stdout.Read(buf)
		if n > 0 {
			delta := string(buf[:n])
			full.WriteString(delta)
			emitAIChunk(AIStreamChunk{ID: requestID, Delta: delta})
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
			if ctx.Err() != nil {
				emitAIChunk(AIStreamChunk{ID: requestID, Done: true})
				return full.String(), ctx.Err()
			}
			emitAIChunk(AIStreamChunk{ID: requestID, Done: true, Error: readErr.Error()})
			return full.String(), readErr
		}
	}
	waitErr := cmd.Wait()
	if waitErr != nil && ctx.Err() == nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = waitErr.Error()
		}
		emitAIChunk(AIStreamChunk{ID: requestID, Done: true, Error: msg})
		return full.String(), fmt.Errorf("%s", msg)
	}
	emitAIChunk(AIStreamChunk{ID: requestID, Done: true})
	if a.store != nil {
		_ = a.store.AddHistory("ai-chat", fmt.Sprintf("%d chars", full.Len()))
	}
	return full.String(), nil
}

func (a *AIService) testCLI(p *AIProfile) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	cmd, stdin, cleanup, err := buildCLICmd(ctx, p, "hi")
	if cleanup != nil {
		defer cleanup()
	}
	if err != nil {
		return "", err
	}
	if stdin != "" {
		cmd.Stdin = strings.NewReader(stdin)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	start := time.Now()
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("%s", msg)
	}
	label := strings.TrimSpace(p.Model)
	if label == "" {
		label = "cli"
	}
	return fmt.Sprintf("%s · %dms", label, time.Since(start).Milliseconds()), nil
}

func (a *AIService) fetchCLIModels(p *AIProfile) ([]string, error) {
	bin := strings.ToLower(strings.TrimSpace(p.Command))
	if !strings.Contains(bin, "ollama") {
		return nil, fmt.Errorf("model list is only available for ollama commands")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	path, err := lookupBin("ollama")
	if err != nil {
		return nil, err
	}
	out, err := exec.CommandContext(ctx, path, "list").Output()
	if err != nil {
		return nil, err
	}
	var ids []string
	for i, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || i == 0 {
			continue
		}
		name := strings.Fields(line)
		if len(name) == 0 {
			continue
		}
		ids = append(ids, name[0])
	}
	return ids, nil
}

func buildCLICmd(ctx context.Context, p *AIProfile, prompt string) (*exec.Cmd, string, func(), error) {
	if p == nil || strings.TrimSpace(p.Command) == "" {
		return nil, "", nil, fmt.Errorf("a CLI command is required")
	}
	model := strings.TrimSpace(p.Model)
	parts, err := splitCLI(p.Command)
	if err != nil {
		return nil, "", nil, err
	}
	if def := matchAgentDef(parts[0]); def != nil && commandMatchesDef(parts, def) {
		return buildAgentCmd(ctx, def, model, prompt)
	}
	hasPrompt := strings.Contains(p.Command, "{prompt}")
	for i := range parts {
		parts[i] = strings.ReplaceAll(parts[i], "{model}", model)
		parts[i] = strings.ReplaceAll(parts[i], "{prompt}", prompt)
	}
	bin, err := lookupBin(parts[0])
	if err != nil {
		return nil, "", nil, err
	}
	cmd := exec.CommandContext(ctx, bin, parts[1:]...)
	cmd.Dir = cliWorkDir()
	stdin := ""
	if !hasPrompt {
		stdin = prompt
	}
	return cmd, stdin, nil, nil
}

func buildAgentCmd(ctx context.Context, def *cliAgentDef, model, prompt string) (*exec.Cmd, string, func(), error) {
	var bin string
	var err error
	for _, name := range def.bins {
		bin, err = lookupBin(name)
		if err == nil {
			break
		}
	}
	if bin == "" {
		return nil, "", nil, fmt.Errorf("command not found: %s", def.bins[0])
	}
	args := append([]string{}, def.args...)
	if model != "" && def.modelFlag != "" {
		args = append(args, def.modelFlag, model)
	}
	stdin := ""
	var cleanup func()
	switch def.prompt {
	case cliPromptArg:
		args = append(args, prompt)
	case cliPromptFile:
		flag := def.fileFlag
		if flag == "" {
			flag = "--prompt-file"
		}
		f, err := os.CreateTemp("", "hitool-prompt-*.txt")
		if err != nil {
			return nil, "", nil, err
		}
		if _, err := f.WriteString(prompt); err != nil {
			_ = f.Close()
			_ = os.Remove(f.Name())
			return nil, "", nil, err
		}
		_ = f.Close()
		path := f.Name()
		args = append(args, flag, path)
		cleanup = func() { _ = os.Remove(path) }
	default:
		stdin = prompt
	}
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = cliWorkDir()
	return cmd, stdin, cleanup, nil
}

func cliWorkDir() string {
	if dir := os.TempDir(); dir != "" {
		return dir
	}
	if home, err := os.UserHomeDir(); err == nil {
		return home
	}
	return "."
}

func flattenMessages(msgs []ChatMessage) string {
	var b strings.Builder
	for i, m := range msgs {
		if i > 0 {
			b.WriteString("\n\n")
		}
		switch strings.ToLower(strings.TrimSpace(m.Role)) {
		case "system":
			b.WriteString("System:\n")
		case "assistant":
			b.WriteString("Assistant:\n")
		default:
			b.WriteString("User:\n")
		}
		b.WriteString(strings.TrimSpace(m.Content))
	}
	return b.String()
}

func splitCLI(cmd string) ([]string, error) {
	cmd = strings.TrimSpace(cmd)
	if cmd == "" {
		return nil, fmt.Errorf("empty command")
	}
	var parts []string
	var b strings.Builder
	var quote rune
	for _, r := range cmd {
		switch {
		case quote != 0:
			if r == quote {
				quote = 0
			} else {
				b.WriteRune(r)
			}
		case r == '\'' || r == '"':
			quote = r
		case unicode.IsSpace(r):
			if b.Len() > 0 {
				parts = append(parts, b.String())
				b.Reset()
			}
		default:
			b.WriteRune(r)
		}
	}
	if quote != 0 {
		return nil, fmt.Errorf("unclosed quote in command")
	}
	if b.Len() > 0 {
		parts = append(parts, b.String())
	}
	if len(parts) == 0 {
		return nil, fmt.Errorf("empty command")
	}
	return parts, nil
}

func lookupBin(name string) (string, error) {
	if strings.Contains(name, string(os.PathSeparator)) || strings.HasPrefix(name, ".") {
		if _, err := os.Stat(name); err != nil {
			return "", fmt.Errorf("command not found: %s", name)
		}
		return name, nil
	}
	for _, cand := range binNames(name) {
		if p, err := exec.LookPath(cand); err == nil {
			return p, nil
		}
	}
	for _, dir := range extraBinDirs() {
		for _, cand := range binNames(name) {
			p := filepath.Join(dir, cand)
			if st, err := os.Stat(p); err == nil && !st.IsDir() {
				return p, nil
			}
		}
	}
	return "", fmt.Errorf("command not found: %s (GUI apps often miss Homebrew PATH — use a full path)", name)
}

func binNames(name string) []string {
	if runtime.GOOS == "windows" && !strings.HasSuffix(strings.ToLower(name), ".exe") {
		return []string{name + ".exe", name}
	}
	return []string{name}
}

func extraBinDirs() []string {
	home, _ := os.UserHomeDir()
	dirs := []string{
		"/opt/homebrew/bin",
		"/usr/local/bin",
		"/usr/bin",
		filepath.Join(home, ".local/bin"),
		filepath.Join(home, "bin"),
		filepath.Join(home, ".grok/bin"),
		filepath.Join(home, ".cargo/bin"),
		filepath.Join(home, "Library/pnpm"),
		filepath.Join(home, ".npm-global/bin"),
	}
	if b, err := os.ReadFile(filepath.Join(home, ".nvm/alias/default")); err == nil {
		ver := strings.TrimSpace(string(b))
		if ver != "" {
			dirs = append(dirs, filepath.Join(home, ".nvm/versions/node", ver, "bin"))
		}
	}
	return dirs
}
