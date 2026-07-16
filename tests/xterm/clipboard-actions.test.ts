import { describe, it, expect, vi } from "vitest";
import {
  attachClipboardContextMenu,
  runClipboardAction,
  type ClipboardActionDeps,
  type ClipboardTermLike,
} from "../../src/renderer/src/xterm/clipboard-actions";

function fakeDeps(opts?: {
  selection?: string;
  clipboardText?: string;
  bracketed?: boolean;
  readRejects?: boolean;
  writeRejects?: boolean;
}) {
  let selection = opts?.selection ?? "";
  const pastes: string[] = [];
  const ptyWrites: string[] = [];
  const term: ClipboardTermLike = {
    hasSelection: () => selection.length > 0,
    getSelection: () => selection,
    clearSelection: vi.fn(() => {
      selection = "";
    }),
    paste: (data) => {
      pastes.push(data);
    },
    focus: vi.fn(),
    modes: { bracketedPasteMode: opts?.bracketed ?? false },
  };
  const readText = vi.fn((_type?: "selection") =>
    opts?.readRejects
      ? Promise.reject(new Error("ipc down"))
      : Promise.resolve(opts?.clipboardText ?? ""),
  );
  const writeText = vi.fn((_text: string) =>
    opts?.writeRejects
      ? Promise.reject(new Error("ipc down"))
      : Promise.resolve(),
  );
  const deps: ClipboardActionDeps = {
    term,
    writePty: (data) => {
      ptyWrites.push(data);
    },
    clipboard: { readText, writeText },
  };
  return { deps, term, pastes, ptyWrites, readText, writeText };
}

describe("runClipboardAction — copy", () => {
  it("copy writes the selection to the clipboard and keeps the selection", async () => {
    const f = fakeDeps({ selection: "picked" });
    await runClipboardAction("copy", f.deps);
    expect(f.writeText).toHaveBeenCalledWith("picked");
    expect(f.term.clearSelection).not.toHaveBeenCalled();
  });

  it("copy-and-clear also clears the selection (VS Code's Windows Ctrl+C)", async () => {
    const f = fakeDeps({ selection: "picked" });
    await runClipboardAction("copy-and-clear", f.deps);
    expect(f.writeText).toHaveBeenCalledWith("picked");
    expect(f.term.clearSelection).toHaveBeenCalled();
  });

  it("copy with an empty selection is a no-op (unreachable via dispatch, guarded anyway)", async () => {
    const f = fakeDeps();
    await runClipboardAction("copy", f.deps);
    expect(f.writeText).not.toHaveBeenCalled();
  });

  it("a clipboard write failure is swallowed (never rejects, selection kept)", async () => {
    const f = fakeDeps({ selection: "picked", writeRejects: true });
    await expect(
      runClipboardAction("copy-and-clear", f.deps),
    ).resolves.toBeUndefined();
    expect(f.term.clearSelection).not.toHaveBeenCalled();
  });
});

describe("runClipboardAction — paste", () => {
  it("pastes clipboard text through xterm's paste path", async () => {
    const f = fakeDeps({ clipboardText: "hello" });
    await runClipboardAction("paste", f.deps);
    expect(f.pastes).toEqual(["hello"]);
    expect(f.ptyWrites).toEqual([]);
  });

  it("strips a trailing newline when not in bracketed paste mode (hijack mitigation)", async () => {
    const f = fakeDeps({ clipboardText: "cmd\n" });
    await runClipboardAction("paste", f.deps);
    expect(f.pastes).toEqual(["cmd"]);
  });

  it("keeps the trailing newline in bracketed paste mode", async () => {
    const f = fakeDeps({ clipboardText: "cmd\n", bracketed: true });
    await runClipboardAction("paste", f.deps);
    expect(f.pastes).toEqual(["cmd\n"]);
  });

  it("empty read + 'paste' writes the ^V byte to the pty (Claude CLI image paste)", async () => {
    const f = fakeDeps({ clipboardText: "" });
    await runClipboardAction("paste", f.deps);
    expect(f.ptyWrites).toEqual(["\x16"]);
    expect(f.pastes).toEqual([]);
  });

  it("empty read + 'paste-no-fallback' does nothing (Ctrl+Shift+V / right-click)", async () => {
    const f = fakeDeps({ clipboardText: "" });
    await runClipboardAction("paste-no-fallback", f.deps);
    expect(f.ptyWrites).toEqual([]);
    expect(f.pastes).toEqual([]);
  });

  it("'paste-selection' reads the X11 selection clipboard", async () => {
    const f = fakeDeps({ clipboardText: "primary" });
    await runClipboardAction("paste-selection", f.deps);
    expect(f.readText).toHaveBeenCalledWith("selection");
    expect(f.pastes).toEqual(["primary"]);
  });

  it("a read failure is a total no-op — never the fallback byte on error", async () => {
    const f = fakeDeps({ readRejects: true });
    await expect(runClipboardAction("paste", f.deps)).resolves.toBeUndefined();
    expect(f.ptyWrites).toEqual([]);
    expect(f.pastes).toEqual([]);
  });
});

describe("attachClipboardContextMenu — Windows right-click copyPaste", () => {
  function contextMenu(el: HTMLElement, shiftKey = false): MouseEvent {
    const e = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      shiftKey,
    });
    el.dispatchEvent(e);
    return e;
  }

  it("win32 + selection: consumes the event and copies-and-clears", async () => {
    const f = fakeDeps({ selection: "picked" });
    const el = document.createElement("div");
    attachClipboardContextMenu(el, "win32", f.deps);
    const e = contextMenu(el);
    expect(e.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(f.writeText).toHaveBeenCalledWith("picked"));
    expect(f.term.clearSelection).toHaveBeenCalled();
  });

  it("win32 + no selection: focuses the terminal and pastes (no fallback byte)", async () => {
    const f = fakeDeps({ clipboardText: "hello" });
    const el = document.createElement("div");
    attachClipboardContextMenu(el, "win32", f.deps);
    const e = contextMenu(el);
    expect(e.defaultPrevented).toBe(true);
    expect(f.term.focus).toHaveBeenCalled();
    await vi.waitFor(() => expect(f.pastes).toEqual(["hello"]));
    expect(f.ptyWrites).toEqual([]);
  });

  it("win32 + shift: untouched (event not consumed, nothing runs)", () => {
    const f = fakeDeps({ selection: "picked" });
    const el = document.createElement("div");
    attachClipboardContextMenu(el, "win32", f.deps);
    const e = contextMenu(el, true);
    expect(e.defaultPrevented).toBe(false);
    expect(f.writeText).not.toHaveBeenCalled();
  });

  it("darwin: right-click is untouched", () => {
    const f = fakeDeps({ selection: "picked" });
    const el = document.createElement("div");
    attachClipboardContextMenu(el, "darwin", f.deps);
    expect(contextMenu(el).defaultPrevented).toBe(false);
  });

  it("the returned cleanup detaches the listener", () => {
    const f = fakeDeps({ selection: "picked" });
    const el = document.createElement("div");
    const detach = attachClipboardContextMenu(el, "win32", f.deps);
    detach();
    expect(contextMenu(el).defaultPrevented).toBe(false);
    expect(f.writeText).not.toHaveBeenCalled();
  });
});
