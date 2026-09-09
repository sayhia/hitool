# HiTool × Material Design 3 — 设计文档

- 日期:2026-09-09
- 状态:用户已认可(深度=连导航 M3 化;分类色=动态色源)
- 范围:设计令牌 + 全部基础组件 + 导航形态 + 明暗主题;53 个工具经共享类自动继承

## 色彩系统(M3 角色)

- **双种子**:应用靛蓝 `#4f52c8` 生成品牌方案;7 个分类色各自作为动态色源。
- **角色公式化**:`tokens.css` 以 `color-mix` 从种子派生 primary/on-primary/primary-container/secondary-container 与表面五层(bg→s-3)、outline 三档;深色主题只翻转混合基准与中性色阶(light: primary=seed;dark: primary=seed 52% 提亮至 tone-80)。
- **动态分类**:`.frame` 内 `--cat-seed`(ToolFrame 注入 `var(--cat-seed-<id>)`)在元素上下文重算整套分类角色(--cat-primary/containers/state layers),明暗由 knob 变量切换。旧变量 `--cat/--cat-bright/--cat-wash/--cat-line` 保留为派生别名,存量工具引用不断。
- 静态分类标识(侧栏圆点)保留 tone-40/80 双值;wash/line 改为公式派生。

## 组件规范(base.css v0.8)

- **按钮四件套**:.btn=Tonal(secondary-container 填充、药丸形、状态层);.btn-signal/.btn-primary=Filled(primary 填充、e-1);.btn-quiet=Text;.btn-danger=错误色 Text。悬停/按下用 on-* 10%/18% 状态层。
- **输入框**:M3 Outlined——outline 描边、聚焦 primary 双重描边(border + inset ring)、hover 提深;分类场景聚焦跟随 --cat-primary。
- **Chip**:M3 Filter Chip(8px 圆角、outline 描边、选中 secondary-container 填充);**seg**:M3 Segmented Button(连通描边、分隔线、选中 tonal 填充)。
- **形状刻度**:4/8/12/16/28px(xs/sm/md/lg/xl)+ pill;**海拔**:M3 三级(e-1/e-2/e-3),卡片恢复真实投影。
- 横幅(container-high 面)、徽标(primary-container)、进度条(6px 圆头 primary)、滑杆(primary 滑钮 + 分类色光环)、空状态(分类 primary-container 图版)。

## 导航 M3 化(后续任务)

- 侧栏 → Navigation Drawer 形态(选中项药丸指示器、secondary-container 底);顶栏 → Top App Bar(surface-container)+ Primary Tabs(主色文字 + 圆头指示条);窗口拖拽区保持。

## 兼容与验证

- 全部旧令牌名保留为别名;53 个工具零标记改动换肤。
- 验证:vue-tsc、1007 测试、构建、浏览器实测(浅/深双主题 + 分类动态色种子注入),后续 67 工具巡检。
