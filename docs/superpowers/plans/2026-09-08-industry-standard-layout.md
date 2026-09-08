# HiTool 回归行业标准布局 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 撤销"顶栏+抽屉"方案,回归常驻侧栏 + 纯标签顶栏 + 启动首页 + 内容居中限宽的行业惯用布局(依据 spec `docs/superpowers/specs/2026-09-08-industry-standard-layout-design.md`)。

**Architecture:** SideTree 恢复为 flex 常驻子元素;tabs store 增加永久第一位的"首页"固定标签,所有变更函数加守卫;HomeView 作为 "/" 路由;ToolFrame 增加居中限宽容器与 `wide` 逃生口;快捷键 ⌘B/数字键行为恢复为侧栏语义。

**Tech Stack:** Vue 3 `<script setup>` + vue-router(hash)+ Pinia 式手写 store(ref 模块单例)+ vitest(node 环境)+ Wails3 绑定(`@bindings/hitool/services/storeservice`)。

**关键背景(执行者必读):**

- `SideTree.vue`、`HomeView.vue` 的前身 `StartView.vue` **不在 git 历史里**(整轮重构均未提交),完整文件内容已内联在本计划中,直接整文件写入即可。
- 前端所有命令都在 `frontend/` 目录下执行。
- 提交时**只 add 本任务明确列出的文件**——工作区有大量其他未提交改动,严禁 `git add -A` / `git add .`。
- vitest 为 node 环境;stores 模块可导入测试(update.test.ts 已有先例);`inWails()` 在测试中为 false,`persistTabs` 走 localStorage 分支,测试里用 `vi.stubGlobal` 打桩。

---

### Task 1: tokens.css — 恢复 `--side-w`,新增 `--content-w`

**Files:**
- Modify: `frontend/src/styles/tokens.css`(约 162 行,metrics 区块)

- [ ] **Step 1: 替换令牌**

把:

```css
  --drawer-w: 280px;
  --tabs-h: 40px;
```

改为:

```css
  --side-w: 232px;
  --content-w: 1120px;
  --tabs-h: 40px;
```

- [ ] **Step 2: 确认无残留引用**

Run: `cd frontend && grep -rn "drawer-w" src/`
Expected: 无输出。若出现引用,仅可能是 `SideTree.vue`(Task 4 会整文件重写,先忽略)。

- [ ] **Step 3: Commit**

```bash
git -C . add frontend/src/styles/tokens.css
git commit -m "feat(layout): 恢复 --side-w 并新增 --content-w 内容限宽令牌"
```

---

### Task 2: sidebar.ts — 恢复常驻侧栏语义

**Files:**
- Modify: `frontend/src/stores/sidebar.ts`(整文件重写)

- [ ] **Step 1: 整文件重写为以下内容**

```typescript
/**
 * The tool tree lives in a permanent sidebar beside the content. It can be
 * collapsed (⌘B or the strip's reveal button) and the state persists so the
 * app comes back the way it was left.
 */
import { ref } from "vue";
import * as StoreService from "@bindings/hitool/services/storeservice";
import { inWails } from "../lib/backend";

const KEY = "layout.sidebar";

export const sidebarOpen = ref(true);

/** Category the number keys asked the tree to reveal ("" = none). */
export const focusedCat = ref("");

export function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
  persist();
}

export function setSidebar(open: boolean) {
  if (sidebarOpen.value === open) return;
  sidebarOpen.value = open;
  persist();
}

function persist() {
  const v = sidebarOpen.value ? "1" : "0";
  try {
    if (inWails()) void StoreService.SetSetting(KEY, v);
    else localStorage.setItem(KEY, v);
  } catch {
    /* persistence is best-effort */
  }
}

export async function initSidebar() {
  let saved = "";
  try {
    saved = inWails()
      ? await StoreService.GetSetting(KEY)
      : localStorage.getItem(KEY) || "";
  } catch {
    /* fall through to default */
  }
  // Unset keeps the expanded default; only an explicit "0" collapses.
  sidebarOpen.value = saved !== "0";
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/sidebar.ts
git commit -m "feat(layout): 侧栏恢复常驻语义,默认展开"
```

---

### Task 3: tabs store — 首页固定标签(TDD)

**Files:**
- Test: `frontend/src/stores/tabs.test.ts`(新建)
- Modify: `frontend/src/stores/tabs.ts`
- Modify: `frontend/src/locales/zh.json`、`frontend/src/locales/en.json`(tabs 段新增 `home`)

- [ ] **Step 1: 新增 i18n 键**

`zh.json` 的 `"tabs"` 段(约 1206 行起)首行加入:

```json
    "home": "首页",
```

`en.json` 的 `"tabs"` 段加入:

```json
    "home": "Home",
```

- [ ] **Step 2: 写失败测试 `frontend/src/stores/tabs.test.ts`**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lang } from "../lib/i18n";
import {
  closeAll,
  closeOthers,
  closeTab,
  moveTab,
  persistTabs,
  syncFromRoute,
  tabTitle,
  useTabs,
} from "./tabs";

const router = { push: vi.fn() };
const { tabs, activePath } = useTabs();

beforeEach(() => {
  tabs.value = [];
  activePath.value = "";
  lang.value = "zh";
  router.push.mockClear();
});

describe("home tab", () => {
  it("syncFromRoute always keeps home first", () => {
    syncFromRoute("/");
    expect(tabs.value.map((x) => x.path)).toEqual(["/"]);
    syncFromRoute("/t/json-format");
    expect(tabs.value.map((x) => x.path)).toEqual(["/", "/t/json-format"]);
  });

  it("tabTitle renders the translated home label", () => {
    expect(tabTitle({ path: "/", toolId: "", icon: "House", pinned: true })).toBe("首页");
  });

  it("closeTab refuses to close home", () => {
    syncFromRoute("/t/json-format");
    closeTab("/", router);
    expect(tabs.value.map((x) => x.path)).toEqual(["/", "/t/json-format"]);
  });

  it("closeAll keeps home and lands on it", () => {
    syncFromRoute("/t/json-format");
    syncFromRoute("/t/regex-test");
    closeAll(router);
    expect(tabs.value.map((x) => x.path)).toEqual(["/"]);
    expect(router.push).toHaveBeenCalledWith("/");
  });

  it("closeOthers keeps home and the target", () => {
    syncFromRoute("/t/json-format");
    syncFromRoute("/t/regex-test");
    closeOthers("/t/json-format", router);
    expect(tabs.value.map((x) => x.path)).toEqual(["/", "/t/json-format"]);
  });

  it("moveTab cannot move the home slot", () => {
    syncFromRoute("/t/json-format");
    syncFromRoute("/t/regex-test");
    moveTab(0, 2);
    expect(tabs.value.map((x) => x.path)).toEqual(["/", "/t/json-format", "/t/regex-test"]);
  });

  it("persistTabs omits home", () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      setItem: (k: string, v: string) => (store[k] = v),
      getItem: (k: string) => store[k] ?? "",
    });
    syncFromRoute("/t/json-format");
    persistTabs();
    const saved = JSON.parse(store["layout.tabs"]);
    expect(saved.map((x: { path: string }) => x.path)).toEqual(["/t/json-format"]);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `cd frontend && npx vitest run src/stores/tabs.test.ts`
Expected: FAIL(home 相关断言失败:`syncFromRoute("/")` 后 tabs 为空等)。

- [ ] **Step 4: 实现 — 修改 `frontend/src/stores/tabs.ts`**

4a. 在 `const tabs = ref<Tab[]>([]);`(约 20 行)之后插入:

```typescript
/** The home tab is a permanent fixture: always index 0, never closable. */
const HOME_TAB: Tab = { path: "/", toolId: "", icon: "House", pinned: true };

function ensureHome() {
  if (tabs.value[0]?.path === "/") return;
  tabs.value = [HOME_TAB, ...tabs.value.filter((x) => x.path !== "/")];
}
```

4b. `tabTitle` 改为:

```typescript
export function tabTitle(tab: Tab): string {
  if (tab.path === "/") return t("tabs.home");
  return t(`tools.${tab.toolId}.name`);
}
```

4c. `syncFromRoute` 开头(`activePath.value = path;` 之后)插入一行:

```typescript
  ensureHome();
```

4d. `closeTab` 函数开头插入守卫:

```typescript
  if (path === "/") return;
```

4e. `closeOthers` 的 filter 改为:

```typescript
  tabs.value = tabs.value.filter((x) => x.path === path || x.pinned || x.path === "/");
```

4f. `closeAll` 整函数改为:

```typescript
export function closeAll(router: Router) {
  tabs.value = tabs.value.filter((x) => x.pinned || x.path === "/");
  // Home always sorts first, so the first non-home tab is the fallback.
  const rest = tabs.value.filter((x) => x.path !== "/");
  router.push(rest[0]?.path ?? "/");
}
```

4g. `togglePin` 开头插入守卫:

```typescript
  if (path === "/") return;
```

4h. `moveTab` 的范围检查改为(追加 home 槽位守卫):

```typescript
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return;
  if (from === 0 || to === 0) return;
```

4i. `restoreTabs` 的 `if (!raw) return;` 之前插入 `ensureHome();`,并把函数末尾的合并改为(home 固定在最前):

```typescript
  if (!restored.length) return;
  tabs.value = [
    ...tabs.value.filter((x) => x.path === "/"),
    ...restored.filter((x) => x.pinned),
    ...restored.filter((x) => !x.pinned),
    ...tabs.value.filter((x) => x.path !== "/"),
  ];
```

4j. `persistTabs` 的 map 改为:

```typescript
    tabs.value
      .filter((x) => x.path !== "/")
      .map((x) => ({ path: x.path, pinned: x.pinned })),
```

- [ ] **Step 5: 运行确认通过**

Run: `cd frontend && npx vitest run src/stores/tabs.test.ts`
Expected: PASS(7 个用例全绿)。再跑全量 `npx vitest run`,确认无回归(3 个 skip 之外全绿)。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/tabs.ts frontend/src/stores/tabs.test.ts frontend/src/locales/zh.json frontend/src/locales/en.json
git commit -m "feat(tabs): 首页固定标签——常驻首位、不可关闭/拖动,不参与持久化"
```

---

### Task 4: SideTree.vue — 恢复 flex 常驻侧栏

**Files:**
- Modify: `frontend/src/layout/SideTree.vue`(整文件重写;该文件不在 git 历史中,以下为完整内容)

- [ ] **Step 1: 整文件写入**

```vue
<script setup lang="ts">
/**
 * The one navigator: a single tree listing every tool — favourites, then
 * each category with its tools inline. A filter box at the top flattens the
 * tree to matches as you type, which is the fastest path to any tool when
 * you know its name; ⌘K stays the semantic path (actions, outputs).
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { CATEGORIES, TOOLS, canonicalToolId, toolById, toolsInCategory, uniqueTools, type CategoryId } from "../lib/tools";
import { t, lang } from "../lib/i18n";
import { inWails } from "../lib/backend";
import { focusedCat, sidebarOpen } from "../stores/sidebar";
import { openSettings } from "../stores/settings";
import { theme, cycleTheme } from "../lib/theme";
import * as StoreService from "@bindings/hitool/services/storeservice";
import Icon from "../components/Icon.vue";
import BrandLogo from "../components/BrandLogo.vue";
import UpdateButton from "../components/UpdateButton.vue";

const route = useRoute();
const router = useRouter();

const filter = ref("");
const collapsed = ref<Set<CategoryId>>(new Set());
const favorites = ref<string[]>([]);

const activeCat = computed<CategoryId | "">(() => {
  const p = route.path;
  if (p.startsWith("/c/")) return (p.slice(3) as CategoryId) || "";
  if (p.startsWith("/t/")) return toolById(canonicalToolId(p.slice(3)))?.category ?? "";
  return "";
});

const activeTool = computed(() => {
  const p = route.path;
  return p.startsWith("/t/") ? canonicalToolId(p.slice(3)) : "";
});

const name = (id: string) => {
  void lang.value;
  return t(`tools.${id}.name`);
};

/** Flat match list while filtering; groups otherwise. */
const matches = computed(() => {
  void lang.value;
  const q = filter.value.trim().toLowerCase();
  if (!q) return [];
  return TOOLS.filter(
    (tool) =>
      t(`tools.${tool.id}.name`).toLowerCase().includes(q) ||
      tool.id.includes(q) ||
      t(`tools.${tool.id}.desc`).toLowerCase().includes(q),
  ).map((tool) => ({ id: tool.id, icon: tool.icon, label: name(tool.id), cat: tool.category }));
});

const favTools = computed(() => {
  void lang.value;
  return uniqueTools(favorites.value).map((x) => ({ id: x.id, icon: x.icon, label: name(x.id) }));
});

function toggleCat(id: CategoryId) {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}

function isOpen(id: CategoryId) {
  return !collapsed.value.has(id) || activeCat.value === id || focusedCat.value === id;
}

async function loadFavs() {
  if (!inWails()) return;
  try {
    favorites.value = (await StoreService.GetFavorites()) ?? [];
  } catch {
    favorites.value = [];
  }
}

onMounted(loadFavs);
watch(() => route.path, loadFavs);

// Number keys land here: reveal and scroll to the requested category.
watch(focusedCat, (id) => {
  if (!id) return;
  collapsed.value = new Set([...collapsed.value].filter((c) => c === id));
  requestAnimationFrame(() => {
    document.querySelector(`[data-cat="${id}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  });
});

const themeIcon = computed(() =>
  theme.value === "dark" ? "Moon" : theme.value === "light" ? "Sun" : "SunMoon",
);
</script>

<template>
  <aside class="tree">
    <div class="brand">
      <BrandLogo :size="26" />
    </div>

    <div class="filter">
      <Icon name="Search" class="f-ico" />
      <input
        v-model="filter"
        class="f-in"
        :placeholder="t('cmd.placeholder')"
        spellcheck="false"
      />
      <button v-if="filter" class="f-x" :title="t('common.clear')" @click="filter = ''">
        <Icon name="X" />
      </button>
    </div>

    <nav class="body scroll-y">
      <!-- Filtering: one flat list of hits across the whole catalogue. -->
      <template v-if="filter">
        <button
          v-for="m in matches"
          :key="m.id"
          type="button"
          class="row"
          :class="{ on: activeTool === m.id }"
          @click="router.push(`/t/${m.id}`); filter = ''"
        >
          <span class="ico" :class="m.cat"><Icon :name="m.icon" /></span>
          <span class="txt truncate">{{ m.label }}</span>
        </button>
        <p v-if="!matches.length" class="hint pad">{{ t("common.noResults") }}</p>
      </template>

      <template v-else>
        <section v-if="favTools.length" class="grp">
          <div class="g-h">{{ t("common.favorites") }}</div>
          <button
            v-for="tool in favTools"
            :key="`fav-${tool.id}`"
            type="button"
            class="row"
            :class="{ on: activeTool === tool.id }"
            :title="tool.label"
            @click="router.push(`/t/${tool.id}`)"
          >
            <span class="ico fav"><Icon :name="tool.icon" /></span>
            <span class="txt truncate">{{ tool.label }}</span>
          </button>
        </section>

        <section
          v-for="c in CATEGORIES"
          :key="c.id"
          class="grp"
          :data-cat="c.id"
        >
          <button
            type="button"
            class="g-btn"
            :class="[c.id, { open: isOpen(c.id), on: activeCat === c.id }]"
            @click="toggleCat(c.id)"
          >
            <Icon name="ChevronRight" class="caret" />
            <span class="ico" :class="c.id"><Icon :name="c.icon" /></span>
            <span class="txt truncate">{{ t(`nav.${c.id}`) }}</span>
            <span class="lab n">{{ toolsInCategory(c.id).length }}</span>
          </button>

          <div v-if="isOpen(c.id)" class="kids">
            <button
              v-for="tool in toolsInCategory(c.id)"
              :key="tool.id"
              type="button"
              class="row kid"
              :class="{ on: activeTool === tool.id }"
              :title="name(tool.id)"
              @click="router.push(`/t/${tool.id}`)"
            >
              <span class="ico"><Icon :name="tool.icon" /></span>
              <span class="txt truncate">{{ name(tool.id) }}</span>
              <Icon v-if="favorites.includes(tool.id)" name="Star" class="stared" />
            </button>
          </div>
        </section>
      </template>
    </nav>

    <div class="foot">
      <UpdateButton />
      <button class="f-btn" :title="t('settings.theme')" @click="cycleTheme">
        <Icon :name="themeIcon" />
      </button>
      <button class="f-btn" :title="t('nav.settings')" @click="openSettings()">
        <Icon name="Settings2" />
      </button>
    </div>
  </aside>
</template>

<style scoped>
.tree {
  width: var(--side-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--chrome);
  backdrop-filter: blur(var(--chrome-blur));
  -webkit-backdrop-filter: blur(var(--chrome-blur));
  border-right: 1px solid var(--line);
}

.brand {
  min-height: var(--tabs-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 7px 12px;
  border-bottom: 1px solid var(--line-2);
  --wails-draggable: drag;
}

.filter {
  margin: 10px 10px 6px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-1);
  transition: border-color 0.16s var(--ease);
}

.filter:focus-within {
  border-color: var(--acc);
}

.f-ico {
  width: 13px;
  height: 13px;
  color: var(--ink-3);
  flex-shrink: 0;
}

.f-in {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--ink);
  font-family: var(--f-ui);
  font-size: var(--t-sm);
}

.f-in::placeholder {
  color: var(--ink-4);
}

.f-x {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
}

.f-x svg {
  width: 11px;
  height: 11px;
}

.body {
  flex: 1;
  min-height: 0;
  padding: 4px 8px 12px;
}

.grp {
  margin-bottom: 10px;
}

.g-h,
.g-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 5px 7px;
  border: 0;
  font-family: var(--f-ui);
  text-align: left;
}

.g-h {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.02em;
  color: var(--ink-4);
}

.g-btn {
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  font-size: var(--t-sm);
  font-weight: 650;
  cursor: pointer;
}

.g-btn:hover {
  background: var(--hover);
}

.caret {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  color: var(--ink-4);
  transition: transform 0.16s var(--ease-out);
}

.g-btn.open .caret {
  transform: rotate(90deg);
}

.g-btn .ico,
.g-btn .txt {
  color: var(--ink);
}

.g-btn .ico {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.g-btn .ico svg {
  width: 15px;
  height: 15px;
}

.ico.pdf { color: var(--cat-pdf); }
.ico.image { color: var(--cat-image); }
.ico.text { color: var(--cat-text); }
.ico.dev { color: var(--cat-dev); }
.ico.calculator { color: var(--cat-calculator); }
.ico.creative { color: var(--cat-creative); }
.ico.ai { color: var(--cat-ai); }
.ico.fav { color: var(--warn); }

.g-btn.on {
  background: var(--hover);
}

.n {
  margin-left: auto;
  flex-shrink: 0;
}

.kids {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 2px 0 4px;
  padding-left: 14px;
  border-left: 1px solid var(--line-2);
  margin-left: 13px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  font-family: var(--f-ui);
  font-size: var(--t-sm);
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s var(--ease), color 0.12s var(--ease);
}

.row:hover:not(.on) {
  background: var(--hover);
  color: var(--ink);
}

.row.on {
  background: var(--acc-wash);
  color: var(--acc);
  font-weight: 650;
}

.row .ico {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ink-3);
}

.row .ico svg {
  width: 14px;
  height: 14px;
}

.row.on .ico {
  color: var(--acc);
}

.row .txt {
  flex: 1;
  min-width: 0;
}

.stared {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  color: var(--warn);
}

.pad {
  padding: 10px 8px;
}

.foot {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  border-top: 1px solid var(--line-2);
}

.f-btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
}

.f-btn:hover {
  background: var(--hover);
  color: var(--ink);
}

.f-btn svg {
  width: 15px;
  height: 15px;
}

.foot :deep(.update) {
  margin-right: auto;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/layout/SideTree.vue
git commit -m "feat(layout): SideTree 恢复 flex 常驻侧栏,移除抽屉化代码"
```

---

### Task 5: HomeView.vue — 新建启动首页

**Files:**
- Create: `frontend/src/views/HomeView.vue`

- [ ] **Step 1: 创建文件,内容如下**

复用既有 i18n 键(`land.title / land.sub / land.searchHint / land.recent`、`common.favorites`、`cmd.placeholder`),无需新增键。

```vue
<script setup lang="ts">
/**
 * The home tab: the permanent landing point. One search field (it opens the
 * palette), recent tools, favourites — nothing else. Every other destination
 * lives one click away in the tree.
 */
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import { t, lang } from "../lib/i18n";
import { toolById, uniqueTools } from "../lib/tools";
import * as StoreService from "@bindings/hitool/services/storeservice";
import { inWails } from "../lib/backend";

const router = useRouter();
const recents = ref<string[]>([]);
const favorites = ref<string[]>([]);

onMounted(async () => {
  if (!inWails()) return;
  try {
    const rows = (await StoreService.GetHistory(40)) ?? [];
    const ids: string[] = [];
    for (const r of rows) {
      if (r.tool && !ids.includes(r.tool)) ids.push(r.tool);
      if (ids.length >= 8) break;
    }
    recents.value = ids;
  } catch {
    recents.value = [];
  }
  try {
    favorites.value = (await StoreService.GetFavorites()) ?? [];
  } catch {
    favorites.value = [];
  }
});

function openPalette() {
  window.dispatchEvent(new Event("hitool:open-palette"));
}

const recentTools = computed(() => {
  void lang.value;
  return uniqueTools(recents.value).map((x) => ({
    id: x.id,
    icon: x.icon,
    label: t(`tools.${x.id}.name`),
  }));
});

const favTools = computed(() => {
  void lang.value;
  return uniqueTools(favorites.value).map((x) => ({
    id: x.id,
    icon: x.icon,
    label: t(`tools.${x.id}.name`),
  }));
});
</script>

<template>
  <div class="start">
    <div class="hero">
      <h1>{{ t("land.title") }}</h1>
      <p class="sub">{{ t("land.sub") }}</p>
      <button class="search" @click="openPalette">
        <Icon name="Search" />
        <span>{{ t("cmd.placeholder") }}</span>
        <kbd>⌘K</kbd>
      </button>
      <p class="hint">{{ t("land.searchHint") }}</p>
    </div>

    <section v-if="favTools.length" class="recent">
      <div class="r-head">{{ t("common.favorites") }}</div>
      <div class="r-row">
        <button
          v-for="tool in favTools"
          :key="`fav-${tool.id}`"
          type="button"
          class="r-chip"
          @click="router.push(`/t/${tool.id}`)"
        >
          <Icon :name="tool.icon" />
          <span class="truncate">{{ tool.label }}</span>
        </button>
      </div>
    </section>

    <section v-if="recentTools.length" class="recent">
      <div class="r-head">{{ t("land.recent") }}</div>
      <div class="r-row">
        <button
          v-for="tool in recentTools"
          :key="tool.id"
          type="button"
          class="r-chip"
          @click="router.push(`/t/${tool.id}`)"
        >
          <Icon :name="tool.icon" />
          <span class="truncate">{{ tool.label }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.start {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 9vh 32px 40px;
}

.hero {
  max-width: 560px;
  margin: 0 auto;
  text-align: center;
}

h1 {
  font-size: var(--t-3xl);
  font-weight: 800;
  letter-spacing: -0.03em;
}

.sub {
  margin-top: 6px;
  color: var(--ink-3);
  font-size: var(--t-md);
}

.search {
  margin-top: 26px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--s-1);
  color: var(--ink-3);
  font-family: var(--f-ui);
  font-size: var(--t-md);
  cursor: pointer;
  transition: border-color 0.16s var(--ease), box-shadow 0.16s var(--ease);
}

.search:hover {
  border-color: var(--acc-line);
  box-shadow: var(--focus-ring);
}

.search svg {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.search span {
  flex: 1;
  text-align: left;
}

.search kbd {
  font-size: 10px;
}

.hero .hint {
  margin-top: 12px;
}

.recent {
  max-width: 640px;
  margin: 36px auto 0;
}

.r-head {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.02em;
  color: var(--ink-4);
  padding: 0 2px 8px;
}

.r-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.r-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px;
  max-width: 200px;
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--s-1);
  color: var(--ink-2);
  font-family: var(--f-ui);
  font-size: var(--t-sm);
  font-weight: 550;
  cursor: pointer;
}

.r-chip:hover {
  border-color: var(--acc-line);
  color: var(--acc);
}

.r-chip svg {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/HomeView.vue
git commit -m "feat(home): 新增首页视图——搜索、最近使用、收藏"
```

---

### Task 6: router.ts — "/" 指向首页,删除 RedirectView

**Files:**
- Modify: `frontend/src/router.ts`
- Delete: `frontend/src/views/RedirectView.vue`

- [ ] **Step 1: 修改路由**

把:

```typescript
const routes: RouteRecordRaw[] = [
  { path: "/", component: () => import("./views/RedirectView.vue") },
  // Categories live in the tool tree now; deep links land on the redirect page.
  { path: "/c/:id", redirect: "/" },
```

改为:

```typescript
const routes: RouteRecordRaw[] = [
  { path: "/", component: () => import("./views/HomeView.vue") },
  // Categories live in the sidebar tree; deep links land on home.
  { path: "/c/:id", redirect: "/" },
```

- [ ] **Step 2: 删除 RedirectView 并确认无引用**

```bash
rm frontend/src/views/RedirectView.vue
grep -rn "RedirectView" frontend/src/ || echo CLEAN
```

Expected: 输出 `CLEAN`。

- [ ] **Step 3: Commit**

RedirectView.vue 是未跟踪文件,直接删除即可,无需 git 操作。

```bash
git add frontend/src/router.ts
git commit -m "feat(router): \"/\" 直接渲染首页,移除启动重定向"
```

---

### Task 7: TabStrip.vue — 顶栏回归纯标签 + 折叠态展开按钮

**Files:**
- Modify: `frontend/src/layout/TabStrip.vue`

- [ ] **Step 1: 移除品牌标志**

删除 import 行:

```typescript
import BrandLogo from "../components/BrandLogo.vue";
```

删除模板中的整块:

```html
    <div class="brand-mark" :title="t('land.title')">
      <BrandLogo :size="22" />
    </div>
```

以及 `<style scoped>` 里的整个 `.brand-mark { ... }` 规则块。

- [ ] **Step 2: 侧栏开关改为"仅折叠态显示的展开按钮"**

把现有的:

```html
    <button
      class="tb side-toggle"
      :title="sidebarOpen ? t('nav.collapse') : t('nav.expand')"
      @click="toggleSidebar"
    >
      <Icon :name="sidebarOpen ? 'PanelLeftClose' : 'PanelLeft'" />
    </button>
```

改为:

```html
    <!-- Only visible while the sidebar is collapsed: the one way back. -->
    <button
      v-if="!sidebarOpen"
      class="tb"
      :title="t('nav.expand')"
      @click="setSidebar(true)"
    >
      <Icon name="PanelLeft" />
    </button>
```

并把 import 行改为:

```typescript
import { sidebarOpen, setSidebar } from "../stores/sidebar";
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/layout/TabStrip.vue
git commit -m "feat(tabs): 顶栏回归纯标签,仅折叠态显示侧栏展开按钮"
```

---

### Task 8: AppShell.vue — 侧栏回到 flex 行 + 数字键恢复

**Files:**
- Modify: `frontend/src/layout/AppShell.vue`

- [ ] **Step 1: 恢复布局**

把模板中的:

```html
  <div class="shell">
    <div class="col">
```

改为:

```html
  <div class="shell">
    <SideTree v-if="sidebarOpen" />
    <div class="col">
```

并删除后面独立成行的 `<SideTree />`(overlay 位置,约 196 行,`</div>` 与 `<CommandPalette` 之间)。

`.shell` 样式改回行向:

```css
.shell {
  display: flex;
  height: 100%;
  background: var(--bg);
}
```

- [ ] **Step 2: 调整 imports**

`sidebar` 一行改为:

```typescript
import { focusedCat, setSidebar, sidebarOpen, toggleSidebar } from "../stores/sidebar";
```

- [ ] **Step 3: 数字键恢复"侧栏显示分类"**

把 `onKey` 里的裸数字分支:

```typescript
  // Bare digits reveal the Nth category in the tool tree, but never
  // while typing. (⌘1…9 switch tabs instead.)
  if (!meta && !inField && /^[1-9]$/.test(e.key)) {
    const cat = CATEGORIES[Number(e.key) - 1];
    if (cat) {
      focusedCat.value = cat.id;
      toggleSidebar();
    }
  }
```

改为:

```typescript
  // Bare digits reveal the Nth category in the sidebar, but never while
  // typing. (⌘1…9 switch tabs instead.)
  if (!meta && !inField && /^[1-9]$/.test(e.key)) {
    const cat = CATEGORIES[Number(e.key) - 1];
    if (cat) {
      setSidebar(true);
      // focusedCat also drives the reveal watch inside SideTree.
      focusedCat.value = "";
      requestAnimationFrame(() => (focusedCat.value = cat.id));
    }
  }
```

⌘B 分支保持不变(`toggleSidebar()` 即折叠/展开)。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/layout/AppShell.vue
git commit -m "feat(shell): 侧栏回到 flex 行内,数字键恢复分类显示"
```

---

### Task 9: ToolFrame.vue — 内容居中限宽 + wide 逃生口

**Files:**
- Modify: `frontend/src/work/ToolFrame.vue`

- [ ] **Step 1: 增加 `wide` prop**

```typescript
const props = withDefaults(
  defineProps<{ toolId: string; shape?: "flow" | "batch" | "single"; wide?: boolean }>(),
  { shape: "single", wide: false },
);
```

- [ ] **Step 2: 模板挂类**

```html
  <div class="frame" :class="{ wide: props.wide }" :style="catVars">
```

- [ ] **Step 3: CSS — 默认限宽居中,wide 放开**

在 `.body { ... }` 规则之后追加:

```css
/* The work canvas keeps a readable width on wide windows; `wide` opts out
   for tools that genuinely need every pixel (image diff, stitch). */
.frame:not(.wide) > .body {
  max-width: var(--content-w);
  width: 100%;
  margin-inline: auto;
}
```

- [ ] **Step 4: 类型检查**

Run: `cd frontend && npx vue-tsc --noEmit`
Expected: 无输出(通过)。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/work/ToolFrame.vue
git commit -m "feat(frame): 工具画布默认居中限宽,新增 wide 逃生口"
```

---

### Task 10: 全量验证

- [ ] **Step 1: 类型检查**

Run: `cd frontend && npx vue-tsc --noEmit`
Expected: 通过。

- [ ] **Step 2: 测试**

Run: `cd frontend && npx vitest run`
Expected: 61+ 文件全绿(新增 tabs.test.ts),3 skip。

- [ ] **Step 3: 构建**

Run: `cd frontend && npx vite build`
Expected: 成功。

- [ ] **Step 4: 浏览器手测清单**

`cd frontend && npx vite --port 5183` 后逐项确认:

- 启动落在首页,首页标签固定第一位且无关闭按钮
- 打开 2-3 个工具 → 标签正常;全部关闭后回到首页标签
- 侧栏常驻;⌘B 折叠后顶栏左端出现展开按钮,点击恢复
- 数字键 1-9:侧栏滚动并展开对应分类
- ⌘K / ⌘J / 检查器 / 标签右键菜单 / 拖拽排序正常
- 工具内容居中限宽(窗口拉宽时两侧留白),侧栏折叠后画布随之加宽但不超 1120px
- 标签持久化:重启后工具标签恢复,首页标签仍在首位

已知浏览器开发模式噪音(与本次改动无关):onboarding 遮罩在纯浏览器下无法跳过、动画停在起始帧——判断以桌面模式为准。

- [ ] **Step 5: 收尾提交(如有零散修正)**

```bash
git status   # 确认没有意外文件
```

---

## Self-Review 记录

- **Spec 覆盖**:spec 三节设计 → Task 1(令牌)、2+4(侧栏)、3(首页标签)、5+6(首页路由)、7(顶栏)、8(快捷键/布局)、9(限宽)。验证清单 → Task 10。无遗漏。
- **占位符**:无 TBD/TODO;SideTree/HomeView/sidebar.ts 整文件内联,其余为精确 old/new 片段。
- **命名一致性**:`ensureHome`/`HOME_TAB`/`setSidebar`/`focusedCat`/`--content-w`/`wide` 各任务间一致;`tabs.home` 键在 Task 3 定义且被 `tabTitle` 引用。
