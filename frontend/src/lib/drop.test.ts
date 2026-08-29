import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileInfo } from "@bindings/hitool/services/models";

/**
 * `drop.ts` reaches for two things this suite has no real copy of: Vue's
 * lifecycle hooks and the Wails event bus. Both are replaced with recorders,
 * so a test can play the KeepAlive transitions Vue would otherwise drive and
 * fire the event Go would otherwise emit.
 *
 * That is the point of the file: the deactivation logic exists *because* a
 * cached tool stays mounted, and nothing that only exercises mount/unmount
 * would notice it going wrong again.
 */
const hooks = {
  activated: [] as (() => void)[],
  deactivated: [] as (() => void)[],
  unmount: [] as (() => void)[],
};

vi.mock("vue", async () => {
  const actual = await vi.importActual<typeof import("vue")>("vue");
  return {
    ...actual,
    onActivated: (fn: () => void) => hooks.activated.push(fn),
    onDeactivated: (fn: () => void) => hooks.deactivated.push(fn),
    onBeforeUnmount: (fn: () => void) => hooks.unmount.push(fn),
  };
});

let emit: ((ev: unknown) => void) | undefined;
vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: (_name: string, cb: (ev: unknown) => void) => {
      emit = cb;
      return () => {};
    },
  },
}));

// The bridge also attaches drag listeners for the hover affordance; in node
// there is no window to attach them to.
(globalThis as { window?: unknown }).window = { addEventListener: () => {} };

const { installDropBridge, onFilesDropped, dragActive, extOf, partitionByExt, handoffState } =
  await import("./drop");

installDropBridge();

const file = (name: string): FileInfo =>
  ({ path: `/tmp/${name}`, name, size: 1 }) as FileInfo;

/** A component that subscribes, with handles for the lifecycle transitions. */
function mount() {
  const calls: { files: FileInfo[]; zone: string }[] = [];
  const i = hooks.activated.length;
  onFilesDropped((files, zone) => calls.push({ files, zone }));
  return {
    calls,
    activate: () => hooks.activated[i](),
    deactivate: () => hooks.deactivated[i](),
    unmount: () => hooks.unmount[i](),
  };
}

const drop = (files: FileInfo[], zone = "source") => emit!({ data: { files, zone } });

beforeEach(() => {
  hooks.activated.length = 0;
  hooks.deactivated.length = 0;
  hooks.unmount.length = 0;
});

describe("onFilesDropped", () => {
  it("delivers files and the zone they landed on", () => {
    const a = mount();
    drop([file("x.pdf")], "source");
    expect(a.calls).toHaveLength(1);
    expect(a.calls[0].zone).toBe("source");
    expect(a.calls[0].files.map((f) => f.name)).toEqual(["x.pdf"]);
    a.unmount();
  });

  it("stops delivering once the component is deactivated", () => {
    // This is the regression: a tool whose tab went to the background is
    // still mounted, so unsubscribing on unmount alone never fires.
    const a = mount();
    a.deactivate();
    drop([file("x.pdf")]);
    expect(a.calls).toHaveLength(0);
    a.unmount();
  });

  it("resumes when the component comes back on screen", () => {
    const a = mount();
    a.deactivate();
    drop([file("one.pdf")]);
    a.activate();
    drop([file("two.pdf")]);
    expect(a.calls.map((c) => c.files[0].name)).toEqual(["two.pdf"]);
    a.unmount();
  });

  it("delivers only to the tool on screen", () => {
    const background = mount();
    const foreground = mount();
    background.deactivate();
    drop([file("x.pdf")]);
    expect(foreground.calls).toHaveLength(1);
    expect(background.calls).toHaveLength(0);
    background.unmount();
    foreground.unmount();
  });

  it("keeps delivering to a component that is never cached", () => {
    // Outside a KeepAlive tree neither hook ever fires, so `active` has to
    // start true rather than wait for an activation that will not come.
    const a = mount();
    drop([file("x.pdf")]);
    expect(a.calls).toHaveLength(1);
    a.unmount();
  });

  it("stops delivering after unmount", () => {
    const a = mount();
    a.unmount();
    drop([file("x.pdf")]);
    expect(a.calls).toHaveLength(0);
  });

  it("ignores a drop that carried no files", () => {
    const a = mount();
    emit!({ data: { files: [], zone: "source" } });
    emit!({ data: undefined });
    expect(a.calls).toHaveLength(0);
    a.unmount();
  });

  it("unwraps a payload the runtime delivered as an array", () => {
    const a = mount();
    emit!({ data: [{ files: [file("x.pdf")], zone: "source" }] });
    expect(a.calls).toHaveLength(1);
    a.unmount();
  });

  it("reports an empty zone rather than undefined", () => {
    const a = mount();
    emit!({ data: { files: [file("x.pdf")] } });
    expect(a.calls[0].zone).toBe("");
    a.unmount();
  });

  it("clears the drag affordance on any drop", () => {
    dragActive.value = true;
    emit!({ data: { files: [] } });
    expect(dragActive.value).toBe(false);
  });
});

describe("extOf", () => {
  it("takes the last extension, lowercased", () => {
    expect(extOf("/a/b/Report.PDF")).toBe("pdf");
    expect(extOf("archive.tar.gz")).toBe("gz");
  });

  it("handles a path with no extension", () => {
    expect(extOf("/usr/bin/ffmpeg")).toBe("");
  });

  it("does not read a directory's dot as the file's extension", () => {
    expect(extOf("/some.dir/README")).toBe("");
  });

  it("handles windows separators", () => {
    expect(extOf("C:\\Users\\me\\a.txt")).toBe("txt");
  });

  it("treats a dotfile's name as the extension, as the shell does", () => {
    expect(extOf(".gitignore")).toBe("gitignore");
  });
});

describe("partitionByExt", () => {
  const files = [file("a.pdf"), file("b.PNG"), file("c.txt")];

  it("takes everything when nothing is specified", () => {
    const { taken, rejected } = partitionByExt(files, []);
    expect(taken).toHaveLength(3);
    expect(rejected).toHaveLength(0);
  });

  it("splits on the accepted extensions, ignoring case", () => {
    const { taken, rejected } = partitionByExt(files, ["pdf", "png"]);
    expect(taken.map((f) => f.name)).toEqual(["a.pdf", "b.PNG"]);
    expect(rejected.map((f) => f.name)).toEqual(["c.txt"]);
  });

  it("accepts extensions written with a leading dot or star", () => {
    expect(partitionByExt(files, [".pdf"]).taken.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(partitionByExt(files, ["*.pdf"]).taken.map((f) => f.name)).toEqual(["a.pdf"]);
  });
});

describe("handoffState", () => {
  it("survives the structured clone that pushState performs", async () => {
    const { ref } = await import("vue");
    const files = ref<FileInfo[]>([file("a.pdf"), file("b.pdf")]);

    // The naive version is what shipped: spreading the array copies it but
    // leaves every element a reactive Proxy, and a Proxy cannot be cloned.
    // pushState then throws DataCloneError, vue-router falls back to
    // location.assign, and the files never reach the tool.
    expect(() => structuredClone([...files.value])).toThrow();
    expect(() => structuredClone(handoffState(files.value))).not.toThrow();
  });

  it("carries the same field values across", () => {
    const state = handoffState([file("report.pdf")]);
    expect(state.files).toEqual([{ path: "/tmp/report.pdf", name: "report.pdf", size: 1 }]);
  });

  it("copies rather than aliasing, so later edits cannot leak in", () => {
    const src = [file("a.pdf")];
    const state = handoffState(src);
    src[0].name = "changed.pdf";
    expect(state.files[0].name).toBe("a.pdf");
  });

  it("handles an empty list", () => {
    expect(handoffState([])).toEqual({ files: [] });
  });
});
