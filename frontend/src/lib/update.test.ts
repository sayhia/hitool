import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkUpdate, compareVersions, normalizeVersion } from "./update";

// The updater now lives behind services.UpdateService (Wails bindings).
// Mock it so the wrapper logic is tested without a real backend.
vi.mock("@bindings/hitool/services/updateservice", () => ({
  Check: vi.fn(),
  DownloadAndInstall: vi.fn(),
  CurrentVersion: vi.fn(),
  State: vi.fn(),
}));
import * as UpdateService from "@bindings/hitool/services/updateservice";

describe("normalizeVersion", () => {
  it("strips leading v and build metadata", () => {
    expect(normalizeVersion("v1.2.3")).toBe("1.2.3");
    expect(normalizeVersion(" 1.2.3+build.5 ")).toBe("1.2.3");
    expect(normalizeVersion("")).toBe("0.0.0");
  });
});

describe("compareVersions", () => {
  it("compares numeric segments left to right", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("0.2.0", "0.10.1")).toBeLessThan(0);
  });

  it("treats missing segments as zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("2", "1.9.9")).toBeGreaterThan(0);
  });

  it("sorts a prerelease below the same release", () => {
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBeLessThan(0);
  });

  it("ignores the leading v on either side", () => {
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
  });
});

describe("checkUpdate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps an updater release to the frontend shape", async () => {
    (UpdateService.Check as ReturnType<typeof vi.fn>).mockResolvedValue({
      hasUpdate: true,
      currentVersion: "0.1.0",
      latestVersion: "0.9.0",
      releaseUrl: "https://x/rel",
      notes: "release notes",
      artifactName: "hitool-darwin-arm64-0.9.0.zip",
    });
    const info = await checkUpdate();
    expect(info.hasNew).toBe(true);
    expect(info.latest).toBe("0.9.0");
    expect(info.url).toBe("https://x/rel");
    expect(info.notes).toBe("release notes");
  });

  it("reports no update when up to date", async () => {
    (UpdateService.Check as ReturnType<typeof vi.fn>).mockResolvedValue({
      hasUpdate: false,
      currentVersion: "0.1.0",
    });
    const info = await checkUpdate();
    expect(info.hasNew).toBe(false);
  });

  it("surfaces updater errors", async () => {
    (UpdateService.Check as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    await expect(checkUpdate()).rejects.toThrow("boom");
  });
});
