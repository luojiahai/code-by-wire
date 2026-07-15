import { describe, it, expect } from "vitest";
import { editSequence } from "../../src/renderer/src/terminal/key-bindings";
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

describe("editSequence — Shift+Enter newline plus the mac fallback", () => {
  it("maps Shift+Enter to the prompt's newline (Esc+CR) on every platform", () => {
    expect(editSequence(key({ key: "Enter", shiftKey: true }), false)).toBe(
      "\x1b\r",
    );
    expect(editSequence(key({ key: "Enter", shiftKey: true }), true)).toBe(
      "\x1b\r",
    );
  });

  it("leaves plain Enter alone so it still submits", () => {
    expect(editSequence(key({ key: "Enter" }), false)).toBeNull();
    expect(editSequence(key({ key: "Enter" }), true)).toBeNull();
  });

  it("ignores Shift+Enter mid-IME-composition", () => {
    expect(
      editSequence(
        key({ key: "Enter", shiftKey: true, isComposing: true }),
        false,
      ),
    ).toBeNull();
  });

  it("ignores Shift+Enter when another modifier is held", () => {
    expect(
      editSequence(key({ key: "Enter", shiftKey: true, ctrlKey: true }), false),
    ).toBeNull();
    expect(
      editSequence(key({ key: "Enter", shiftKey: true, altKey: true }), false),
    ).toBeNull();
  });

  it("falls back to the mac readline keys on macOS but not elsewhere", () => {
    expect(editSequence(key({ key: "ArrowLeft", metaKey: true }), true)).toBe(
      "\x01",
    );
    expect(
      editSequence(key({ key: "ArrowLeft", metaKey: true }), false),
    ).toBeNull();
  });
});
