import { describe, it, expect } from "vitest";
import {
  macEditSequence,
  type EditKey,
} from "../../src/renderer/src/ui/mac-edit-sequence";

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

describe("macEditSequence — readline bytes for a readline-style prompt", () => {
  it("maps cmd+arrows to line start/end (Ctrl-A / Ctrl-E)", () => {
    expect(macEditSequence(key({ key: "ArrowLeft", metaKey: true }))).toBe(
      "\x01",
    );
    expect(macEditSequence(key({ key: "ArrowRight", metaKey: true }))).toBe(
      "\x05",
    );
  });

  it("maps option+arrows to word back/forward (Esc-b / Esc-f)", () => {
    expect(macEditSequence(key({ key: "ArrowLeft", altKey: true }))).toBe(
      "\x1bb",
    );
    expect(macEditSequence(key({ key: "ArrowRight", altKey: true }))).toBe(
      "\x1bf",
    );
  });

  it("maps cmd+delete to kill-to-line-start and option+delete to delete-word (Ctrl-U / Ctrl-W)", () => {
    expect(macEditSequence(key({ key: "Backspace", metaKey: true }))).toBe(
      "\x15",
    );
    expect(macEditSequence(key({ key: "Backspace", altKey: true }))).toBe(
      "\x17",
    );
  });

  it("maps cmd+forward-delete to kill-to-line-end (Ctrl-K)", () => {
    expect(macEditSequence(key({ key: "Delete", metaKey: true }))).toBe("\x0b");
  });

  it("ignores plain keys, copy/paste, and select-all", () => {
    expect(macEditSequence(key({ key: "ArrowLeft" }))).toBeNull();
    expect(macEditSequence(key({ key: "c", metaKey: true }))).toBeNull();
    expect(macEditSequence(key({ key: "v", metaKey: true }))).toBeNull();
    expect(macEditSequence(key({ key: "a", metaKey: true }))).toBeNull();
  });

  it("ignores selection (shift) and ctrl combos, ambiguous cmd+option, and non-keydown events", () => {
    expect(
      macEditSequence(key({ key: "ArrowLeft", metaKey: true, shiftKey: true })),
    ).toBeNull();
    expect(
      macEditSequence(key({ key: "ArrowLeft", altKey: true, shiftKey: true })),
    ).toBeNull();
    expect(
      macEditSequence(key({ key: "ArrowLeft", ctrlKey: true })),
    ).toBeNull();
    expect(
      macEditSequence(key({ key: "ArrowLeft", metaKey: true, altKey: true })),
    ).toBeNull();
    expect(
      macEditSequence(key({ key: "ArrowLeft", metaKey: true, type: "keyup" })),
    ).toBeNull();
  });

  it("ignores an otherwise-mapped combo while an IME composition is active", () => {
    expect(
      macEditSequence(
        key({ key: "ArrowLeft", altKey: true, isComposing: true }),
      ),
    ).toBeNull();
    expect(
      macEditSequence(
        key({ key: "Backspace", metaKey: true, isComposing: true }),
      ),
    ).toBeNull();
  });
});
