import { describe, it, expect } from "vitest";
import { deferToKeypress } from "../../src/renderer/src/xterm/ime-punctuation";
import type { EditKey } from "../../src/renderer/src/ui/mac-edit-sequence";

function key(over: Partial<EditKey> = {}): EditKey {
  return {
    type: "keydown",
    key: "\\",
    metaKey: false,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    isComposing: false,
    ...over,
  };
}

describe("deferToKeypress", () => {
  it("defers the punctuation a CJK IME substitutes, so keypress can carry the real character", () => {
    // The reported case (issue #439) plus its siblings: \ → 、, . → 。, , → ，, ? → ？
    for (const k of ["\\", ".", ",", "?", ";", ":", "'", '"', "<", ">", "!"]) {
      expect(deferToKeypress(key({ key: k }))).toBe(true);
    }
  });

  it("allows shift — `?` and `~` are only reachable with it", () => {
    expect(deferToKeypress(key({ key: "?", shiftKey: true }))).toBe(true);
    expect(deferToKeypress(key({ key: "~", shiftKey: true }))).toBe(true);
  });

  it("leaves letters and digits on xterm's keydown path (they compose instead)", () => {
    for (const k of ["a", "Z", "0", "9"]) {
      expect(deferToKeypress(key({ key: k }))).toBe(false);
    }
  });

  it("never defers a modifier combo — those are control sequences, not IME text", () => {
    expect(deferToKeypress(key({ ctrlKey: true }))).toBe(false);
    expect(deferToKeypress(key({ altKey: true }))).toBe(false);
    expect(deferToKeypress(key({ metaKey: true }))).toBe(false);
  });

  it("only acts on keydown — the keypress itself must reach xterm to be emitted", () => {
    expect(deferToKeypress(key({ type: "keypress" }))).toBe(false);
    expect(deferToKeypress(key({ type: "keyup" }))).toBe(false);
  });

  it("ignores named keys, which carry no single character", () => {
    for (const k of ["Enter", "Backspace", "ArrowLeft", "Dead", "Process"]) {
      expect(deferToKeypress(key({ key: k }))).toBe(false);
    }
  });
});
