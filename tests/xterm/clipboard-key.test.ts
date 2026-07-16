import { describe, it, expect } from "vitest";
import { clipboardKeyAction } from "../../src/renderer/src/xterm/clipboard-key";
import type { EditKey } from "../../src/renderer/src/ui/mac-edit-sequence";

/** Build an EditKey, keydown with no modifiers and no IME composition by default. */
function key(over: Partial<EditKey> & { key: string }): EditKey {
  return {
    type: "keydown",
    metaKey: false,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    isComposing: false,
    ...over,
  };
}

const ctrlV = key({ key: "v", ctrlKey: true });
const ctrlShiftV = key({ key: "V", ctrlKey: true, shiftKey: true });
const ctrlC = key({ key: "c", ctrlKey: true });
const ctrlShiftC = key({ key: "C", ctrlKey: true, shiftKey: true });

describe("clipboardKeyAction — VSCode's terminal clipboard keybindings", () => {
  it("windows: Ctrl+V and Ctrl+Shift+V both paste", () => {
    expect(clipboardKeyAction(ctrlV, "windows", false)).toBe("paste");
    expect(clipboardKeyAction(ctrlShiftV, "windows", false)).toBe("paste");
  });

  it("linux: Ctrl+Shift+V pastes, plain Ctrl+V stays 0x16 (readline verbatim-insert)", () => {
    expect(clipboardKeyAction(ctrlShiftV, "linux", false)).toBe("paste");
    expect(clipboardKeyAction(ctrlV, "linux", false)).toBeNull();
  });

  it("Ctrl+Shift+C copies only when text is selected", () => {
    expect(clipboardKeyAction(ctrlShiftC, "windows", true)).toBe("copy");
    expect(clipboardKeyAction(ctrlShiftC, "linux", true)).toBe("copy");
    expect(clipboardKeyAction(ctrlShiftC, "windows", false)).toBeNull();
    expect(clipboardKeyAction(ctrlShiftC, "linux", false)).toBeNull();
  });

  it("windows: plain Ctrl+C copies-and-clears with a selection, stays SIGINT without one", () => {
    expect(clipboardKeyAction(ctrlC, "windows", true)).toBe("copy-and-clear");
    expect(clipboardKeyAction(ctrlC, "windows", false)).toBeNull();
  });

  it("linux: plain Ctrl+C is always SIGINT, selection or not", () => {
    expect(clipboardKeyAction(ctrlC, "linux", true)).toBeNull();
    expect(clipboardKeyAction(ctrlC, "linux", false)).toBeNull();
  });

  it("mac: everything flows through natively (Cmd+V comes from the Edit menu)", () => {
    expect(clipboardKeyAction(ctrlV, "mac", false)).toBeNull();
    expect(clipboardKeyAction(ctrlShiftV, "mac", false)).toBeNull();
    expect(
      clipboardKeyAction(key({ key: "v", metaKey: true }), "mac", false),
    ).toBeNull();
    expect(clipboardKeyAction(ctrlC, "mac", true)).toBeNull();
  });

  it("only keydown acts — the combo's keyup falls through", () => {
    expect(
      clipboardKeyAction(
        key({ key: "v", ctrlKey: true, type: "keyup" }),
        "windows",
        false,
      ),
    ).toBeNull();
  });

  it("bails mid-IME-composition", () => {
    expect(
      clipboardKeyAction(
        key({ key: "v", ctrlKey: true, isComposing: true }),
        "windows",
        false,
      ),
    ).toBeNull();
  });

  it("does not hijack AltGr (Ctrl+Alt on Windows layouts) or meta combos", () => {
    expect(
      clipboardKeyAction(
        key({ key: "v", ctrlKey: true, altKey: true }),
        "windows",
        false,
      ),
    ).toBeNull();
    expect(
      clipboardKeyAction(
        key({ key: "v", ctrlKey: true, metaKey: true, shiftKey: true }),
        "linux",
        false,
      ),
    ).toBeNull();
  });

  it("ignores plain keys and non-ctrl combos", () => {
    expect(clipboardKeyAction(key({ key: "v" }), "windows", false)).toBeNull();
    expect(
      clipboardKeyAction(key({ key: "V", shiftKey: true }), "windows", false),
    ).toBeNull();
  });
});
