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
  it("windows: Ctrl+V pastes (with ^V fallback), selection state irrelevant", () => {
    const e = key({ key: "v", ctrlKey: true });
    expect(clipboardKeyAction(e, "windows", false)).toBe("paste");
    expect(clipboardKeyAction(e, "windows", true)).toBe("paste");
  });

  it("windows: Ctrl+Shift+V pastes without the ^V fallback (key arrives uppercase)", () => {
    const e = key({ key: "V", ctrlKey: true, shiftKey: true });
    expect(clipboardKeyAction(e, "windows", false)).toBe("paste-no-fallback");
  });

  it("windows: Ctrl+C copies-and-clears only when there is a selection (else SIGINT passes)", () => {
    const e = key({ key: "c", ctrlKey: true });
    expect(clipboardKeyAction(e, "windows", true)).toBe("copy-and-clear");
    expect(clipboardKeyAction(e, "windows", false)).toBeNull();
  });

  it("windows: Ctrl+Shift+C copies (no clear) only when there is a selection", () => {
    const e = key({ key: "C", ctrlKey: true, shiftKey: true });
    expect(clipboardKeyAction(e, "windows", true)).toBe("copy");
    expect(clipboardKeyAction(e, "windows", false)).toBeNull();
  });

  it("windows: Shift+Insert is left to Chromium's native paste", () => {
    expect(
      clipboardKeyAction(
        key({ key: "Insert", shiftKey: true }),
        "windows",
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

  it("mac: every combo returns null (Cmd+C/V ride the native menu; ^C/^V stay shell bytes)", () => {
    expect(
      clipboardKeyAction(key({ key: "v", ctrlKey: true }), "mac", true),
    ).toBeNull();
    expect(
      clipboardKeyAction(
        key({ key: "V", ctrlKey: true, shiftKey: true }),
        "mac",
        true,
      ),
    ).toBeNull();
    expect(
      clipboardKeyAction(key({ key: "c", ctrlKey: true }), "mac", true),
    ).toBeNull();
    expect(
      clipboardKeyAction(key({ key: "Insert", shiftKey: true }), "mac", true),
    ).toBeNull();
  });

  it("AltGr guard: Ctrl+Alt+V never matches (European Windows layouts type with it)", () => {
    expect(
      clipboardKeyAction(
        key({ key: "v", ctrlKey: true, altKey: true }),
        "windows",
        false,
      ),
    ).toBeNull();
  });

  it("meta-modified combos never match", () => {
    expect(
      clipboardKeyAction(
        key({ key: "v", ctrlKey: true, metaKey: true }),
        "windows",
        false,
      ),
    ).toBeNull();
  });

  it("only keydown matches — keyup and keypress pass through", () => {
    expect(
      clipboardKeyAction(
        key({ key: "v", ctrlKey: true, type: "keyup" }),
        "windows",
        false,
      ),
    ).toBeNull();
  });

  it("mid-IME composition passes through untouched", () => {
    expect(
      clipboardKeyAction(
        key({ key: "v", ctrlKey: true, isComposing: true }),
        "windows",
        false,
      ),
    ).toBeNull();
  });

  it("plain keys and unrelated ctrl combos pass through", () => {
    expect(clipboardKeyAction(key({ key: "v" }), "windows", false)).toBeNull();
    expect(
      clipboardKeyAction(key({ key: "x", ctrlKey: true }), "windows", true),
    ).toBeNull();
  });
});

describe("rightClickAction — VS Code's Windows rightClickBehavior:'copyPaste' default", () => {
  it("windows: copy-and-clear with a selection, paste without", () => {
    expect(rightClickAction("windows", true, false)).toBe("copy-and-clear");
    expect(rightClickAction("windows", false, false)).toBe("paste-no-fallback");
  });

  it("windows: shift+right-click is ignored (VS Code reserves it for the context menu)", () => {
    expect(rightClickAction("windows", true, true)).toBeNull();
    expect(rightClickAction("windows", false, true)).toBeNull();
  });

  it("mac/linux: right-click is untouched (their VS Code defaults need a context menu we don't have)", () => {
    expect(rightClickAction("mac", true, false)).toBeNull();
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
