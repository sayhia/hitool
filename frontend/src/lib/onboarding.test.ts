import { beforeEach, describe, expect, it } from "vitest";

// Node has no window/localStorage; give the persistence layer a tiny stand-in
// before importing the module under test (inWails() sees no _wails → storage path).
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).window = {};
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k) : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

import { markOnboardingDone, onboardingDone, resetOnboarding } from "./onboarding";

describe("onboarding flag", () => {
  beforeEach(() => store.clear());

  it("starts undone", async () => {
    expect(await onboardingDone()).toBe(false);
  });

  it("persists completion", async () => {
    await markOnboardingDone();
    expect(await onboardingDone()).toBe(true);
  });

  it("can be reset so the tour plays again", async () => {
    await markOnboardingDone();
    await resetOnboarding();
    expect(await onboardingDone()).toBe(false);
  });
});
