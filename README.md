# HiTool

多功能桌面工具箱，整合文档、图片、文本、开发与 AI 常用工具，使用 **Go + Wails3 + Vite + Vue 3 + SQLite** 构建。
85+ 个工具全部本地运行，文件不出本机。

## 界面骨架

工具以**标签页**打开并保状态，版面按工具形态自适应，二级控件收进右侧**检查器**。

```
┌──────── 工具栏（毛玻璃，可拖窗） ⌘K ────────┐
│ ☰ 面包屑标题       搜索场 ⌘K  主题 设置 │
├────┬────────────────────────────────┤
│源列表│ [JSON 格式化 ×][Cron 生成器 ×]…  ← Safari 式标签
│收藏 ├──────────────┬─────────┬─────┤
│分类 │ 输入 / 参数    │ 结果      │检查器│
│文档 │               │          │模式库│
│图片 │               │          │片段库│
│ …  ├──────────────┴─────────┴─────┤
│ ⚙  │ 任务坞：2 进行中 · 切页不丢 ⌘J   │
└────┴────────────────────────────────┘
```

- **标签页保状态**：`KeepAlive` 按 tool id 分键缓存，切走再回来输入还在
- **三种版面**：`flow`（输入↔结果，铺满窗口）/ `batch`（源 300 + 参数 400 + 产物弹性）/ `single`（单列居中）
- **检查器抽屉**：模式库、片段库、参考手册、示例移出主流，正则测试主区从 12 层压到 3 层
- **全局任务坞**：任务脱离页面，批量压缩时切去用别的工具进度照跑
- **命令面板**：`⌘K` 直达工具与历史产物，也能执行动作（切主题 / 切语言 / 开合检查器 / 关标签）
- **启动台首页**：居中大搜索场（点开 ⌘K 面板）、拖文件进窗口按类型推荐工具，另有最近使用与收藏
- **产物串联**：输出项「送往…」直接开新标签并预填文件

## 键盘

| 键 | 作用 |
|---|---|
| `⌘K` | 命令面板（工具 / 输出 / 动作） |
| `⌘T` | 打开命令面板 |
| `⌘O` | 为当前工具添加文件 |
| `⌘↵` | 执行 |
| `⌘B` | 展开 / 收起侧栏源列表 |
| `⌘I` | 开合检查器 |
| `⌘J` | 展开 / 收起任务坞 |
| `⌘,` | 打开设置弹窗 |
| `⌘W` | 关闭当前标签 |
| `⌘⌥←/→` | 切换标签页 |
| `⌘1`–`⌘9` | 跳到第 N 个标签 |
| `Esc` | 取消运行中的任务 |
| `1`–`9` | 切换分类 |

以上快捷键均可在 **设置 → 通用 → 键盘快捷键** 中重新录制。

## 功能清单

| 分类 | 工具 |
|------|------|
| 文档 | PDF 合并 / 拆分 / 旋转 / 加密 / 解密 / 压缩 / 增强、PDF 转图片、图片转 PDF、页码与文字水印、提取文本、元数据查看 / 清除、转 Markdown |
| 图片 | 图片转换（JPG/PNG/WebP/BMP/GIF）、压缩、尺寸、水印、图标生成（PNG+ICO+ICNS）、颜色提取、EXIF 查看 / 清除、长图拼接、裁剪、去背景色、九宫格切分、SVG 优化（批量）、压缩前后对比 |
| 文本 | 文本统计、文本处理（管线：去重 / 排序 / 大小写 / 盘古之白 / 筛选）、查找替换（文本 / 正则，改动高亮）、打字测试、文本对比（行级 + 词级，导出 unified diff / HTML）、Markdown 预览、Slug、Lorem 假文 |
| 开发 | 正则测试（含替换预览）、选择器调试（XPath / CSS）、JSON 格式化（含 JSONPath）、JSON 对比、ID 生成器、测试数据、HTTP 速查、CSV 表格、JSON ⇄ CSV、JSON 转实体、Cron 生成器、哈希校验、Base64、URL 工具、JWT 解码 / 生成、SQL 格式化、YAML ⇄ JSON ⇄ TOML、curl 解析、SemVer 计算器 |
| 计算器 | BMI、时间戳转换、利息计算、房贷计算、进制转换、日期计算器（差值 / 推算 / 工作日）、提前还款、个税、倒数日 |
| 小工具 | 密码生成器、二维码（生成 + 识别）、批量重命名、抽奖、密码强度、颜色格式转换 |
| AI | 润色 / 翻译 / 文档 / 表格 / 长文总结 / 代码解释（OpenAI 兼容接口，流式输出 + Markdown 渲染，会话历史与提示词模板） |

## 结构

```
hitool/
├── main.go                 # 应用入口：注册 8 个服务，开启原生拖放并转发落点，窗口位置记忆
├── services/               # Go 后端
│   ├── store.go            #   SQLite（modernc.org/sqlite，纯 Go）：设置 / 收藏 / 历史
│   ├── system.go           #   目录、对话框、文件读写、打开/定位文件（拖入目录递归展开）
│   ├── pdf.go              #   pdfcpu：合并/拆分/旋转/加解密/压缩、水印、文本提取、元数据
│   ├── image.go            #   转换压缩（含 WebP）、缩放、水印、图标生成、EXIF、拼接、九宫格
│   ├── hash.go             #   校验值：一次读取同时喂多个算法
│   ├── qr.go               #   二维码：skip2/go-qrcode 生成、gozxing 识别
│   ├── rename.go           #   批量重命名：先出计划，冲突即拒，改名走临时名两阶段
│   └── ai.go               #   OpenAI 兼容 chat-completions，SSE 流式经事件转发
└── frontend/
    ├── bindings/           # wails3 生成的强类型调用层
    └── src/
        ├── styles/         #   tokens.css（亮/暗双主题令牌）+ base.css（共享组件类）
        ├── stores/         #   tabs（标签页）、inspector、jobs（任务 + 完成通知）、toast、settings
        ├── lib/            #   drop（原生拖放）、i18n、theme（含时段切换）、shortcuts（自定义快捷键）、
        │                   #   onboarding / update、aiHistory / promptTemplates、tools 注册表
        ├── layout/         #   AppShell / RailNav / CommandBar / TabStrip（拖拽排序）/
        │                   #   CommandPalette / SettingsDialog（含快捷键录制）/
        │                   #   JobDock / ToastDock / DropVeil
        ├── components/     #   Icon / AiToolBase（历史 + 模板抽屉）/ Onboarding / JsonTree 等
        ├── work/           #   ToolFrame（唯一框架，三形状）、InspectorSection、
        │                   #   ToolHost（解析 + KeepAlive）、SourceTray、OutputList、
        │                   #   FieldRenderer（声明式控件）、ToolRunner（通用执行器）
        ├── tools/          #   manifest.ts（11 个清单工具）+ bespoke.ts（67 个特形工具注册表）
        └── views/          #   首页（收藏 + 最近）/ 分类 + 特形工具 + dev/ + ai/
```

开发者工具的算法各自独立成模块，便于测试与复用：`lib/jsonToCode.ts`（JSON→五语言）、
`lib/cron.ts`（Quartz 六段构建/解析/执行时间推算）、`lib/jsonpath.ts`（JSONPath 子集，不含脚本表达式）、
`lib/regexReplace.ts`（替换 + 变更分段）、`lib/diff.ts`（行级 LCS + 词级分词对齐）、
`lib/textfile.ts`（BOM / 二进制 / GB18030 / 换行符判定）、`lib/snippets.ts`（正则片段持久化）。
`lib/jsonDiff.ts`（按路径的 JSON 结构比较）、`lib/ids.ts`（UUID v4/v7、ULID、Nano ID）、
`lib/color.ts`（色彩空间互转与 WCAG 对比度）、`lib/fake.ts`（测试数据，含身份证与 Luhn 校验位）、
`lib/units.ts`（十类单位，因子取标准定义值）、`lib/imageDiff.ts`（逐像素比较）、`lib/httpRef.ts`（HTTP 速查表）、
`lib/markdown.ts`（Markdown 子集，原始 HTML 一律转义）、`lib/lines.ts`（行处理流水线）、
`lib/csv.ts`（RFC 4180 解析与转换）、`lib/svgo.ts`（SVG 清理）、`lib/palette.ts`（调色板导出六种格式）。
`lib/diff.ts` 的 unified 导出与 `diff -u` 逐字节对齐，回归用例会直接调用系统 `diff` 比对；
`lib/cron.ts` 的执行时间推算由一份逐秒扫描的独立实现校验，并在 DST 时区下另跑一遍。

前端在 v0.4 做了工作区重构——标签页保状态、自适应版面、检查器抽屉、启动台首页、产物串联。
设计与踩坑记录见 [docs/design-v0.4.md](docs/design-v0.4.md)。

**声明式清单**是这版的关键：11 个「选文件 → 调参数 → 批处理」的工具收敛成 1 个通用执行器
（`work/ToolRunner.vue`）加 11 条清单（`tools/manifest.ts`）。加一个同类工具只需在清单里加一条，
不必再写一个页面——图片尺寸、图片转 PDF 都是这样加进来的，各只花了一条清单。

另外 67 个保留为独立组件，因为它们确实有自己的形态：PDF 增强（前端渲染管线）、取色（画布量化）等用 `batch` 版面；开发者工具与 AI 走
`flow`；计算器类走 `single`。还有 7 个纯声明式轻工具（大小写转换、HTML 转义、行去重等）由通用面板直接渲染。
三种版面都由同一个 `ToolFrame` 提供，不存在第二套骨架。

一致性因此由清单的类型定义和唯一的框架组件保证，而不是靠人把脚手架抄对。

## 设计系统

v0.5 方向是 **macOS 原生精致风**：毛玻璃工具栏与 Finder 式源列表、发丝级半透明描边、
层级靠底色明度而非重阴影、Spotlight 式命令面板、系统设置 inset grouped 表单的设置弹窗（左侧竖排 tab 切换通用 / AI / 数据 / 关于）。
v0.4 的设计记录见 [docs/design-v0.4.md](docs/design-v0.4.md)。

- 亮色为默认主场，暗色是完整设计的第二套（不是反色），`auto` 跟随系统
- 主色系统蓝 `#007AFF`（暗色 `#0A84FF`），只出现在主操作、选中态与焦点光晕上；语义色（绿/黄/红）只表示结果，两者不混用
- 圆角 6/8/10/14/pill 分级；阴影为多层低透明度的柔影
- 首页与分类页磁贴用七分类柔和色图标托（`--tile-*` 令牌）
- 字体全用系统自带（`-apple-system` + `SF Mono`），不外链，不存在静默回退
- 所有颜色只经 `styles/tokens.css` 的自定义属性，组件里不出现硬编码色值

## 开发

环境要求：Go 1.24+、Node 18+、[wails3 CLI](https://v3.wails.io)。

```bash
wails3 dev      # 开发模式（热重载）
wails3 build    # 构建，产物 bin/hitool
wails3 package  # 打包 macOS .app
go test ./services
npm test --prefix frontend        # 前端回归（939 项）
npx vue-tsc --noEmit --project frontend  # vue-tsc，零错误
```

改动 Go 服务签名后需重新生成 bindings：

```bash
wails3 generate bindings -clean=true -ts -i
```

## 技术栈与实现要点

- **Go + Wails3 + Vue 3**；85+ 工具按声明式清单注册，Vue 组件化渲染
- 设置、收藏、使用记录、AI 密钥、主题持久化在 **SQLite**
- PDF 处理用 Go 侧 pdfcpu（加解密为 AES-256）
- 拖放拿到的是**真实文件路径**而非浏览器 File 对象，可直接交给 Go 服务，不必读进内存再传回
- 暂未实现：系统托盘、Whisper 语音识别、YOLO 水印检测

## 开发者工具

开发分类下的主力工具及其功能：

| 工具 | 功能 |
|---|---|
| 正则测试 | 实时匹配高亮、捕获组与命名组分解、**结构解析**（逐 token 说明）、**片段库完整增删改查**（分类 / 说明 / 示例文本、关键词搜索、分类筛选）、分组模式库、示例文本 |
| 选择器调试 | HTML / XML 双模式、**XPath 与 CSS 选择器双语言**（各自保留草稿）、命中节点列表、两套模板与**语法参考手册**（XPath 四组 / CSS 四组，点击插入）、示例、清空 |
| JSON 格式化 | 格式化 / 压缩 / 转义 / 去转义、键名排序、缩进切换、**可折叠树形视图**、**查找替换**（区分大小写 / 全词 / 正则三开关 + 上下跳转 + 全部替换）、结构统计、错误行列定位、简单与复杂示例 |
| JSON 转实体 | Go / TS / Java / C# / Rust 五语言、**语法高亮**、**导出文件**、根类型名与包名、示例 |
| Cron 生成器 | 六段 Quartz 可视化配置、双向解析、常用预设、**11 条表达式参考表**、**执行时间预览** |
| 时间戳转换 | **单位自动识别**、**9 种格式输出**（ISO / RFC / UTC / 中文 / SQL / 斜杠 / 秒 / 毫秒 / 本地 ISO，逐行可复制）、**相对时间**、**9 种语言取时间戳代码片段**、一键填入当前时间、示例 |
| 密码生成器 | 长度与字符集配置、强度与熵值、**生成历史**（会话内，可逐条复制）、**安全建议** |

粗体是亮点功能。另外内置了全局 toast 通知机制——复制 / 保存 / 导出
都有明确反馈，不再只是按钮文字闪一下。

实现上的几处设计决策：

- **正则测试用浏览器 JavaScript 引擎**驱动。Go 的 RE2 不支持前后瞻、反向引用与命名组回引，
  而开发者要测的目标通常正是 JS/PCRE 语义。用 JS 引擎后
  `(?<=...)`、`(?=...)`、`(?<name>...)` 全部可用，且所见即所得。
- **正则片段存进 SQLite**，不依赖本地 JSON 文件。
- **JSON 转实体**基于 IR 解析：数组元素做并集推断（只出现在后续元素里的字段不再丢失），
  `null` 字段带可空标记（Go 出指针、C#/Rust 出可空类型）。Go 输出按 gofmt 对齐列。
- **Cron 生成器**带执行时间预览——按日历跳日搜索，稀疏表达式（如每月 1 号）也能秒出结果。
- **XPath 调试**用 webview 自带的 `DOMParser` + `document.evaluate`，HTML / XML 双模式，无需第三方解析器。
