/**
 * Window-level key handler for a tool page.
 *
 * Tool components sit under ToolHost's KeepAlive, so switching tabs
 * *deactivates* them instead of unmounting: a listener torn down in
 * onBeforeUnmount is still attached for every tool left in the cache. One ⌘↵
 * would then run not just the visible tool but every cached one that still has
 * files in its tray. Binding to activation is what makes a shortcut belong to
 * the tool the user is actually looking at.
 */
import { onActivated, onBeforeUnmount, onDeactivated, onMounted } from "vue";

export function useWindowKeydown(handler: (e: KeyboardEvent) => void) {
  // A first mount inside KeepAlive fires both mounted and activated; adding the
  // same function twice is a no-op for addEventListener, so both can be wired
  // without guarding — and a component used outside KeepAlive still works.
  const add = () => window.addEventListener("keydown", handler);
  const remove = () => window.removeEventListener("keydown", handler);
  onMounted(add);
  onActivated(add);
  onDeactivated(remove);
  onBeforeUnmount(remove);
}
