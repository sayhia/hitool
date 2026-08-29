/**
 * First-run onboarding flag. Stored like every other preference so users who
 * cleared it can see the tour again from Settings > About.
 */
import * as StoreService from "@bindings/hitool/services/storeservice";
import { inWails } from "./backend";

const KEY = "onboarding.done";

export async function onboardingDone(): Promise<boolean> {
  try {
    const raw = inWails()
      ? await StoreService.GetSetting(KEY)
      : localStorage.getItem(KEY) || "";
    return raw === "1";
  } catch {
    return false;
  }
}

export async function markOnboardingDone() {
  try {
    if (inWails()) await StoreService.SetSetting(KEY, "1");
    else localStorage.setItem(KEY, "1");
  } catch {
    /* best-effort */
  }
}

export async function resetOnboarding() {
  try {
    if (inWails()) await StoreService.SetSetting(KEY, "");
    else localStorage.removeItem(KEY);
  } catch {
    /* best-effort */
  }
}
