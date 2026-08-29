# HiTool - GitHub Actions 自动构建

HiTool（Wails v3 + Go + Vue/Vite）配置了 GitHub Actions 自动构建和发布流程，支持多平台打包。

## 触发条件

| 工作流 | 触发 | 职责 |
|--------|------|------|
| `ci.yml` | push / PR 到 `main` | 质量门禁：类型检查、单测、编译验证 |
| `release.yml` | 推送 `v*` 标签（如 `v1.0.0`） | 五平台打包并发布 GitHub Release |

## 支持的平台

| 平台 | 架构 | 产物 |
|------|------|------|
| Linux | amd64 / arm64 | AppImage + deb + rpm |
| macOS | arm64 / amd64 | `.app`（adhoc 签名）+ zip |
| Windows | amd64 | `hitool.exe` + NSIS 安装包 |

## 构建过程

1. **环境准备**：安装 Go 1.25 / Node 22，缓存 Go 模块与 npm 依赖
2. **系统依赖**：Linux 安装 GTK/WebKit 开发库（CGO 编译 GUI 后端必需）；Windows 安装 NSIS
3. **版本注入**（仅 Release）：`set-version.sh` 把 tag 版本写入 config.yml / nfpm / Info.plist / NSIS
4. **前端**：`npm ci` → wails3 重新生成 bindings → `vue-tsc` 类型检查 → vite 生产构建 → vitest 单测
5. **Go 编译**：`-tags production` 三/五平台矩阵
6. **打包上传**：`task` 复用项目 Taskfile 打包链（与本地 `task package` 一致），产物上传 artifact

## 如何发布新版本

```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

GitHub Actions 会自动构建五平台产物并创建 Release（自动生成 release notes）。

## 备注

- SQLite 使用纯 Go 驱动 `modernc.org/sqlite`，Windows 构建无需 CGO/mingw
- wails3 CLI 版本见工作流 `env.WAILS_VERSION`（当前为最新版 `v3.0.0-beta.15`）
- macOS 产物为 adhoc 签名；正式分发需配置 Apple 证书 secrets 并补充公证步骤
