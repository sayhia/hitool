import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Router } from "vue-router";
import { lang } from "../lib/i18n";
import {
  closeAll,
  closeOthers,
  closeTab,
  moveTab,
  persistTabs,
  restoreTabs,
  syncFromRoute,
  tabTitle,
  useTabs,
} from "./tabs";

// node env has no `window`, and inWails() reads window._wails — give it one
// (no _wails) so persistence cleanly takes the localStorage path.
(globalThis as Record<string, unknown>).window = {};

const store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  setItem: (k: string, v: string) => (store[k] = v),
  getItem: (k: string) => store[k] ?? "",
});

const router = { push: vi.fn() } as unknown as Router;
const { tabs, activePath } = useTabs();

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  tabs.value = [];
  activePath.value = "";
  lang.value = "zh";
  vi.mocked(router.push).mockClear();
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
    syncFromRoute("/t/json-format");
    persistTabs();
    const saved = JSON.parse(store["layout.tabs"]);
    expect(saved.map((x: { path: string }) => x.path)).toEqual(["/t/json-format"]);
  });

  it("restoreTabs re-docks home first and excludes it from the round-trip", async () => {
    syncFromRoute("/t/json-format");
    persistTabs();
    tabs.value = [];
    await restoreTabs();
    expect(tabs.value.map((x) => x.path)).toEqual(["/", "/t/json-format"]);
    expect(tabs.value[0].toolId).toBe("");
  });
});
