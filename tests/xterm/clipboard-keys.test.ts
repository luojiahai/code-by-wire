import { describe, it, expect } from "vitest";
import {
  clipboardKeyAction,
  rightClickAction,
  preparePasteText,
} from "../../src/renderer/src/xterm/clipboard-keys";
import type { EditKey } from "../../src/renderer/src/ui/mac-edit-sequence";

/** Keydown builder — mirrors the EditKey slice a real KeyboardEvent satisfies. */
function key(props: Partial<EditKey> & { key: string }): EditKey {
  return {
    type: "keydown",
    metaKey: false,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    isComposing: false,
    ...props,
  };
}

describe("clipboardKeyAction — VS Code's platform clipboard keymap, hardcoded", () => {
  it("win32: Ctrl+V pastes (with ^V fallback), selection state irrelevant", () => {
    const e = key({ key: "v", ctrlKey: true });
    expect(clipboardKeyAction(e, "win32", false)).toBe("paste");
    expect(clipboardKeyAction(e, "win32", true)).toBe("paste");
  });

  it("win32: Ctrl+Shift+V pastes without the ^V fallback (key arrives uppercase)", () => {
    const e = key({ key: "V", ctrlKey: true, shiftKey: true });
    expect(clipboardKeyAction(e, "win32", false)).toBe("paste-no-fallback");
  });

  it("win32: Ctrl+C copies-and-clears only when there is a selection (else SIGINT passes)", () => {
    const e = key({ key: "c", ctrlKey: true });
    expect(clipboardKeyAction(e, "win32", true)).toBe("copy-and-clear");
    expect(clipboardKeyAction(e, "win32", false)).toBeNull();
  });

  it("win32: Ctrl+Shift+C copies (no clear) only when there is a selection", () => {
    const e = key({ key: "C", ctrlKey: true, shiftKey: true });
    expect(clipboardKeyAction(e, "win32", true)).toBe("copy");
    expect(clipboardKeyAction(e, "win32", false)).toBeNull();
  });

  it("win32: Shift+Insert is left to Chromium's native paste", () => {
    expect(
      clipboardKeyAction(
        key({ key: "Insert", shiftKey: true }),
        "win32",
        false,
      ),
    ).toBeNull();
  });

  it("linux: Ctrl+V stays the shell's quoted-insert (VS Code parity)", () => {
    expect(
      clipboardKeyAction(key({ key: "v", ctrlKey: true }), "linux", false),
    ).toBeNull();
  });

  it("linux: Ctrl+Shift+V pastes, Ctrl+Shift+C copies with selection", () => {
    expect(
      clipboardKeyAction(
        key({ key: "V", ctrlKey: true, shiftKey: true }),
        "linux",
        false,
      ),
    ).toBe("paste-no-fallback");
    expect(
      clipboardKeyAction(
        key({ key: "C", ctrlKey: true, shiftKey: true }),
        "linux",
        true,
      ),
    ).toBe("copy");
  });

  it("linux: Shift+Insert pastes the X11 selection clipboard; Ctrl+Shift+Insert does not", () => {
    expect(
      clipboardKeyAction(
        key({ key: "Insert", shiftKey: true }),
        "linux",
        false,
      ),
    ).toBe("paste-selection");
    expect(
      clipboardKeyAction(
        key({ key: "Insert", ctrlKey: true, shiftKey: true }),
        "linux",
        false,
      ),
    ).toBeNull();
  });

  it("darwin: every combo returns null (Cmd+C/V ride the native menu; ^C/^V stay shell bytes)", () => {
    expect(
      clipboardKeyAction(key({ key: "v", ctrlKey: true }), "darwin", true),
    ).toBeNull();
    expect(
      clipboardKeyAction(
        key({ key: "V", ctrlKey: true, shiftKey: true }),
        "darwin",
        true,
      ),
    ).toBeNull();
    expect(
      clipboardKeyAction(key({ key: "c", ctrlKey: true }), "darwin", true),
    ).toBeNull();
    expect(
      clipboardKeyAction(
        key({ key: "Insert", shiftKey: true }),
        "darwin",
        true,
      ),
    ).toBeNull();
  });

  it("AltGr guard: Ctrl+Alt+V never matches (European Windows layouts type with it)", () => {
    expect(
      clipboardKeyAction(
        key({ key: "v", ctrlKey: true, altKey: true }),
        "win32",
        false,
      ),
    ).toBeNull();
  });

  it("meta-modified combos never match", () => {
    expect(
      clipboardKeyAction(
        key({ key: "v", ctrlKey: true, metaKey: true }),
        "win32",
        false,
      ),
    ).toBeNull();
  });

  it("only keydown matches — keyup and keypress pass through", () => {
    expect(
      clipboardKeyAction(
        key({ key: "v", ctrlKey: true, type: "keyup" }),
        "win32",
        false,
      ),
    ).toBeNull();
  });

  it("mid-IME composition passes through untouched", () => {
    expect(
      clipboardKeyAction(
        key({ key: "v", ctrlKey: true, isComposing: true }),
        "win32",
        false,
      ),
    ).toBeNull();
  });

  it("plain keys and unrelated ctrl combos pass through", () => {
    expect(clipboardKeyAction(key({ key: "v" }), "win32", false)).toBeNull();
    expect(
      clipboardKeyAction(key({ key: "x", ctrlKey: true }), "win32", true),
    ).toBeNull();
  });
});

describe("rightClickAction — VS Code's Windows rightClickBehavior:'copyPaste' default", () => {
  it("win32: copy-and-clear with a selection, paste without", () => {
    expect(rightClickAction("win32", true, false)).toBe("copy-and-clear");
    expect(rightClickAction("win32", false, false)).toBe("paste-no-fallback");
  });

  it("win32: shift+right-click is ignored (VS Code reserves it for the context menu)", () => {
    expect(rightClickAction("win32", true, true)).toBeNull();
    expect(rightClickAction("win32", false, true)).toBeNull();
  });

  it("darwin/linux: right-click is untouched (their VS Code defaults need a context menu we don't have)", () => {
    expect(rightClickAction("darwin", true, false)).toBeNull();
    expect(rightClickAction("linux", false, false)).toBeNull();
  });
});

describe("preparePasteText — the non-dialog part of VS Code's shouldPasteTerminalText", () => {
  it("passes single-line text through", () => {
    expect(preparePasteText("echo hi", false)).toBe("echo hi");
    expect(preparePasteText("echo hi", true)).toBe("echo hi");
  });

  it("strips a single trailing newline when NOT in bracketed paste mode (hijack mitigation)", () => {
    expect(preparePasteText("rm -rf /tmp/x\n", false)).toBe("rm -rf /tmp/x");
    expect(preparePasteText("rm -rf /tmp/x\r\n", false)).toBe("rm -rf /tmp/x");
  });

  it("treats a whitespace-only second line as a trailing newline (VS Code parity)", () => {
    expect(preparePasteText("cmd\n  ", false)).toBe("cmd");
  });

  it("keeps the trailing newline in bracketed paste mode (the shell handles it safely)", () => {
    expect(preparePasteText("cmd\n", true)).toBe("cmd\n");
  });

  it("leaves genuine multi-line text untouched", () => {
    expect(preparePasteText("a\nb\nc", false)).toBe("a\nb\nc");
    expect(preparePasteText("a\nb", false)).toBe("a\nb");
    expect(preparePasteText("a\nb\n", false)).toBe("a\nb\n"); // 3 split parts — not the 2-part shape
  });

  it("returns null when nothing pasteable remains", () => {
    expect(preparePasteText("", false)).toBeNull();
    expect(preparePasteText("", true)).toBeNull();
    expect(preparePasteText("\n", false)).toBeNull(); // strip leaves an empty first line
  });
});
