/**
 * Settings is a modal dialog, not a route — opening it never disturbs the
 * tab stack or the back button. Any view can ask for a specific tab, so a
 * banner can deep-link straight to the relevant settings section.
 */
import { ref } from "vue";

export type SettingsTab = "general" | "ai" | "data" | "about";

export const settingsOpen = ref(false);
export const settingsTab = ref<SettingsTab>("general");

export function openSettings(tab: SettingsTab = "general") {
  settingsTab.value = tab;
  settingsOpen.value = true;
}

export function closeSettings() {
  settingsOpen.value = false;
}
