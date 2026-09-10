# HiTool × Material Design 3 — 设计文档

- 日期:2026-09-09
- 状态:用户已认可(深度=连导航 M3 化;分类色=动态色源)
- 范围:设计令牌 + 全部基础组件 + 导航形态 + 明暗主题;62 个工具经共享类自动继承

## 色彩系统(M3 角色)

- **双种子**:应用靛蓝 `#634ecf` 生成品牌方案;6 个分类色各自作为动态色源。
- **角色公式化**:`tokens.css` 以 `color-mix` 从种子派生 primary/on-primary/primary-container/secondary-container 与表面五层(bg→s-3)、outline 三档;深色主题只翻转混合基准与中性色阶(light: primary=seed;dark: primary=seed 52% 提亮至 tone-80)。
- **动态分类**:`.frame` 内 `--cat-seed`(ToolFrame 注入 `var(--cat-seed-<id>)`)在元素上下文重算整套分类角色(--cat-primary/containers/state layers),明暗由 knob 变量切换。旧变量 `--cat/--cat-bright/--cat-wash/--cat-line` 保留为派生别名,存量工具引用不断。
- **分类令牌分两层**:`tokens.css` 只保留每分类一个**静态标识色** `--cat-<id>`(侧栏图标/圆点等小面积标记用,暗色块换成亮值);`-bright/-wash/-line` 不再作为静态令牌存在——凡在 `.frame` 内使用的一律由 `--cat-seed` 公式派生,避免两套色板各自漂移。

## 组件规范(base.css v0.8)

- **按钮四件套**:.btn=Tonal(secondary-container 填充、药丸形、状态层);.btn-signal/.btn-primary=Filled(primary 填充、e-1);.btn-quiet=Text;.btn-danger=错误色 Text。悬停/按下用 on-* 10%/18% 状态层。
- **输入框**:M3 Outlined——outline 描边、聚焦 primary 双重描边(border + inset ring)、hover 提深;分类场景聚焦跟随 --cat-primary。
- **Chip**:M3 Filter Chip(8px 圆角、outline 描边、选中 secondary-container 填充);**seg**:M3 Segmented Button(连通描边、分隔线、选中 tonal 填充)。
- **形状刻度**:4/8/12/16/28px(xs/sm/md/lg/xl)+ pill;**海拔**:M3 三级(e-1/e-2/e-3),卡片恢复真实投影。
- 横幅(container-high 面)、徽标(primary-container)、进度条(6px 圆头 primary)、滑杆(primary 滑钮 + 分类色光环)、空状态(分类 primary-container 图版)。

## 导航 M3 化

- 侧栏 → Navigation Drawer 形态(选中项药丸指示器、secondary-container 底);顶栏 → Top App Bar(surface-container)+ Primary Tabs(主色文字 + 圆头指示条);窗口拖拽区保持。
- 落地为 `SideTree.vue`(含过滤框、分类树内联工具);`HomeView.vue` 为启动首页;原分类路由页由侧栏树展开取代。

## 无障碍(AA)

- 次要文本与语义色按 WCAG AA 校准:在 OKLCH 空间保持色相与彩度、仅调明度。
  - light `--ink-3`/`--on-surface-variant`/`--syn-punc` = `#676374`(最差 4.68 on s-3)
  - light `--ok` `#027c3f`、`--warn` `#9d5c00`、`--info` `#2c69c7`(4.65–5.31)
  - light `--ink-4`/`--syn-com` `#848090`,dark 对应 `#757188`(≥3:1 非文本标准)
- 验证方式:headless Chromium 用 canvas 规范化解析 `color(srgb …)`/`oklch(…)` 后实测对比度。

## 兼容与验证

- 全部旧令牌名保留为别名;62 个工具零标记改动换肤。
- 验证:vue-tsc、991 测试、构建、浏览器实测(浅/深双主题 + 分类动态色种子注入);**62 工具巡检已完成**——明暗双主题 62/62 渲染正常、零错误零横向溢出、6 分类色源 100% 注入、页面级对比度零失败。
