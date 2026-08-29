/**
 * Native file drop. Wails gives us real filesystem paths (not browser File
 * objects), so dropped files go straight to the Go services without ever
 * being read into the webview.
 *
 * Elements that accept files carry `data-file-drop-target="<zone>"`; the Go
 * side reports which one the drop landed on so we can route it.
 */
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, toRaw } from "vue";
import { Events } from "@wailsio/runtime";
import type { FileInfo, FilesDropped } from "@bindings/hitool/services/models";

/** Shape comes from the generated bindings so it cannot drift from the Go struct. */
export type DropPayload = FilesDropped;

/** True while a drag is hovering the window — drives the drop affordance. */
export const dragActive = ref(false);

type Handler = (files: FileInfo[], zone: string) => void;

interface Subscriber {
  handler: Handler;
  /** False while the owning component sits in the KeepAlive cache. */
  active: boolean;
}

const handlers = new Set<Subscriber>();

let installed = false;

export function installDropBridge() {
  if (installed) return;
  installed = true;

  Events.On("files-dropped", (ev) => {
    const d = Array.isArray(ev.data) ? ev.data[0] : ev.data;
    dragActive.value = false;
    if (!d?.files?.length) return;
    for (const s of handlers) if (s.active) s.handler(d.files, d.zone || "");
  });

  // The webview still fires ordinary DOM drag events, which is how we know a
  // drag is in progress; the drop itself is handled natively above.
  window.addEventListener("dragover", (e) => {
    e.preventDefault();
    dragActive.value = true;
  });
  window.addEventListener("dragleave", (e) => {
    if (e.relatedTarget === null) dragActive.value = false;
  });
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragActive.value = false;
  });
}

/**
 * Subscribe to drops for as long as the calling component is on screen.
 *
 * Unmounting is not enough on its own: tools live inside a `<KeepAlive>`, so a
 * tool whose tab is in the background stays mounted with its handler live. A
 * file dropped on the tool you are looking at was landing in the tray of every
 * cached tool as well, which surfaces later as a tab that already has files
 * staged — and a run button that would process them. `onActivated` and
 * `onDeactivated` never fire outside a KeepAlive tree, so components that are
 * not cached simply stay active from mount to unmount.
 */
export function onFilesDropped(handler: Handler) {
  const sub: Subscriber = { handler, active: true };
  handlers.add(sub);
  onBeforeUnmount(() => handlers.delete(sub));
  onActivated(() => (sub.active = true));
  onDeactivated(() => (sub.active = false));
}

/**
 * Plain copies of a file list, fit to travel in `history.state`.
 *
 * `pushState` structured-clones its argument, and a Vue `ref` hands out
 * Proxies — which are not cloneable. The launcher's "open with…" was spreading
 * its reactive array straight into the route state, so `pushState` threw
 * DataCloneError, vue-router quietly fell back to `location.assign`, and the
 * files vanished on the way. The tool opened empty and nothing said why.
 *
 * Everything that puts files into route state goes through here.
 */
export function handoffState(files: FileInfo[]): { files: FileInfo[] } {
  return { files: files.map((f) => ({ ...toRaw(f) })) };
}

/**
 * Take the batch of files another screen handed over — the launcher's drop
 * routing, or a tool's "send to…" — and apply it once.
 *
 * The state is cleared as it is read, so neither hook can apply the same batch
 * twice and a later tab switch cannot re-add files the user has removed. Both
 * hooks are needed: a tool opened for the first time mounts, while one already
 * living in a tab is restored from KeepAlive and only activates.
 *
 * This lives here rather than in each tool because `history.state.files` is a
 * one-shot value: two components reading it would race, and the second would
 * find nothing. One reader, many callers.
 */
export function useFileHandoff(apply: (files: FileInfo[]) => void) {
  const take = () => {
    const handoff = history.state?.files as FileInfo[] | undefined;
    if (!handoff?.length) return;
    history.replaceState({ ...history.state, files: undefined }, "");
    apply(handoff);
  };
  onMounted(take);
  onActivated(take);
}

/** Extension (no dot, lowercase) of a path. */
export function extOf(pathOrName: string): string {
  const base = pathOrName.split(/[\\/]/).pop() || "";
  const i = base.lastIndexOf(".");
  return i < 0 ? "" : base.slice(i + 1).toLowerCase();
}

/** Filter a drop against a tool's accepted extensions. */
export function partitionByExt(files: FileInfo[], accept: string[]) {
  if (!accept.length) return { taken: files, rejected: [] as FileInfo[] };
  const set = new Set(accept.map((e) => e.replace(/^[.*]+/, "").toLowerCase()));
  const taken: FileInfo[] = [];
  const rejected: FileInfo[] = [];
  for (const f of files) (set.has(extOf(f.name || f.path)) ? taken : rejected).push(f);
  return { taken, rejected };
}
