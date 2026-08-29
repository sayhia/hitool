/**
 * Right-hand inspector drawer. Tools register their secondary controls here
 * (pattern libraries, references, examples) instead of stacking them above
 * the work area. Open/closed is global so the drawer doesn't flap while
 * switching tabs.
 */
import { ref } from "vue";

export const inspectorOpen = ref(true);

/** True while some tool has published inspector content. */
export const inspectorHasContent = ref(false);

export function toggleInspector() {
  inspectorOpen.value = !inspectorOpen.value;
}
