#!/usr/bin/env bash
# set-version.sh — 将发布版本号注入打包配置文件
#
# Usage: set-version.sh <version>
#   version: 不带 v 前缀的版本号，如 1.2.3
#
# 注入目标：
#   - build/config.yml                → wails3 生成的资源（syso/图标/安装信息）
#   - build/linux/nfpm/nfpm.yaml      → deb/rpm 包版本
#   - build/darwin/Info.plist         → macOS CFBundleVersion / CFBundleShortVersionString
#   - build/windows/nsis/wails_tools.nsh → Windows 安装器版本信息
#
# 兼容性：sed 统一使用 -i.bak 后缀形式（BSD/GNU 通用）；macOS 替换用 perl（Git Bash 亦自带）。

set -euo pipefail

VERSION="${1:?usage: set-version.sh <version>}"
echo ">> Injecting version: ${VERSION}"

# build/config.yml — 版本来源（默认 0.1.0，跳过注释行）
if [ -f build/config.yml ]; then
  sed -i.bak '/^[[:space:]]*#/!s/version: "0.1.0"/version: "'"${VERSION}"'"/' build/config.yml
fi

# nfpm（deb/rpm）— 默认 0.1.0
if [ -f build/linux/nfpm/nfpm.yaml ]; then
  sed -i.bak "s/^version: \"0.1.0\"/version: \"${VERSION}\"/" build/linux/nfpm/nfpm.yaml
fi

# macOS Info.plist — 默认 0.1.0（perl 跨行匹配，兼容 BSD/GNU）
# 注意：捕获组必须写成 ${1}/${2} 显式界定，避免与后续版本号数字粘连（如 $11 会被解析为组 11）
if [ -f build/darwin/Info.plist ] && command -v perl >/dev/null 2>&1; then
  perl -0777pi -e "s{(<key>CFBundleVersion</key>\s*<string>)[^<]*(</string>)}{\${1}${VERSION}\${2}}; s{(<key>CFBundleShortVersionString</key>\s*<string>)[^<]*(</string>)}{\${1}${VERSION}\${2}}" build/darwin/Info.plist
fi

# Windows NSIS 版本信息 — 默认 0.1.0
if [ -f build/windows/nsis/wails_tools.nsh ]; then
  sed -i.bak 's/INFO_PRODUCTVERSION "0.1.0"/INFO_PRODUCTVERSION "'"${VERSION}"'"/' build/windows/nsis/wails_tools.nsh
fi

# 清理备份文件（-i.bak 兼容写法产生的）
rm -f \
  build/config.yml.bak \
  build/linux/nfpm/nfpm.yaml.bak \
  build/darwin/Info.plist.bak \
  build/windows/nsis/wails_tools.nsh.bak

echo ">> Version injected: ${VERSION}"
