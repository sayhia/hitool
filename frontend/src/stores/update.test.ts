import { beforeEach, describe, expect, it, vi } from "vitest";

// The store is the thing under test; everything it talks to is stubbed so the
// preference logic can be exercised without a backend or a network.
vi.mock("@bindings/hitool/services/storeservice", () => ({
  GetSetting: vi.fn(),
  SetSetting: vi.fn(),
}));
vi.mock("@bindings/hitool/services/updateservice", () => ({ Restart: vi.fn() }));
vi.mock("../lib/backend", () => ({ inWails: () => true }));
vi.mock("../lib/update", () => ({
  checkUpdate: vi.fn(),
  installUpdate: vi.fn(),
  onDownloadProgress: vi.fn(() => () => {}),
}));

import * as StoreService from "@bindings/hitool/services/storeservice";
import { checkUpdate } from "../lib/update";
import {
  autoCheckForUpdates,
  autoUpdate,
  checkForUpdates,
  initAutoUpdate,
  lastCheckedAt,
  resetUpdate,
  setAutoUpdate,
} from "./update";

const getSetting = StoreService.GetSetting as ReturnType<typeof vi.fn>;
const setSetting = StoreService.SetSetting as ReturnType<typeof vi.fn>;
const check = checkUpdate as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  getSetting.mockResolvedValue("");
  setSetting.mockResolvedValue(undefined);
  check.mockResolvedValue({ hasNew: false, current: "1.0.0", latest: "1.0.0", url: "" });
  autoUpdate.value = true;
  lastCheckedAt.value = null;
  resetUpdate();
});

describe("autoUpdate preference", () => {
  it("stays on when the key was never written", async () => {
    getSetting.mockResolvedValue("");
    await initAutoUpdate();
    expect(autoUpdate.value).toBe(true);
  });

  it("is off only for an explicit 0", async () => {
    getSetting.mockResolvedValue("0");
    await initAutoUpdate();
    expect(autoUpdate.value).toBe(false);

    getSetting.mockResolvedValue("1");
    await initAutoUpdate();
    expect(autoUpdate.value).toBe(true);
  });

  it("keeps the default when the store cannot answer", async () => {
    // A failed read must not be mistaken for the user having opted out — that
    // would silently stop updates on every launch after one bad query.
    getSetting.mockRejectedValue(new Error("db locked"));
    await initAutoUpdate();
    expect(autoUpdate.value).toBe(true);
  });

  it("persists both directions", async () => {
    await setAutoUpdate(false);
    expect(setSetting).toHaveBeenCalledWith("update.auto", "0");
    expect(autoUpdate.value).toBe(false);

    await setAutoUpdate(true);
    expect(setSetting).toHaveBeenCalledWith("update.auto", "1");
    expect(autoUpdate.value).toBe(true);
  });

  it("honours the choice for the session even if the write fails", async () => {
    setSetting.mockRejectedValue(new Error("read-only"));
    await setAutoUpdate(false);
    expect(autoUpdate.value).toBe(false);
  });
});

describe("autoCheckForUpdates", () => {
  it("reaches the network when on", async () => {
    autoUpdate.value = true;
    await autoCheckForUpdates();
    expect(check).toHaveBeenCalled();
  });

  it("reaches nothing at all when off", async () => {
    // The whole point of the switch: off means off, not "check but stay quiet".
    autoUpdate.value = false;
    await autoCheckForUpdates();
    expect(check).not.toHaveBeenCalled();
  });
});

describe("lastCheckedAt", () => {
  it("records the time a check actually completed", async () => {
    await checkForUpdates(false);
    expect(lastCheckedAt.value).toBeInstanceOf(Date);
  });

  it("stays unset when the check failed", async () => {
    // "Last checked 14:02" next to a stale answer would be a lie.
    check.mockRejectedValue(new Error("offline"));
    await checkForUpdates(false);
    expect(lastCheckedAt.value).toBeNull();
  });
});
