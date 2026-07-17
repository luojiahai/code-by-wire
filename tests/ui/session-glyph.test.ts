import { describe, it, expect } from "vitest";
import {
  GLYPH,
  SPINNER_FRAMES,
  SPINNER_INTERVAL_MS,
  SPINNER_STATIC_FRAME,
  nextSpinnerFrame,
  glyphTitle,
} from "../../src/renderer/src/ui/session-glyph";

describe("GLYPH — terminal-character session states (2026-07-17 spec §4)", () => {
  it("working is the spinner's slot — char is the reduced-motion frame, teal", () => {
    expect(GLYPH.working).toEqual({
      char: "|",
      tone: "text-working-bright",
    });
  });
  it("waiting is a breathing ? in amber, with the reduced-motion guard", () => {
    expect(GLYPH.waiting).toEqual({
      char: "?",
      tone: "text-accent-bright",
      animate: "animate-glyph-breathe motion-reduce:animate-none",
    });
  });
  it("idle is a hollow circle — hollow still means not-live", () => {
    expect(GLYPH.idle).toEqual({ char: "○", tone: "text-idle" });
  });
  it("ended is a dim en dash", () => {
    expect(GLYPH.ended).toEqual({ char: "–", tone: "text-ink-700" });
  });
});

describe("spinner constants", () => {
  it("cycles the classic shell frames, first frame sharing ended's en dash", () => {
    expect(SPINNER_FRAMES).toEqual(["–", "\\", "|", "/"]);
    expect(SPINNER_FRAMES[0]).toBe(GLYPH.ended.char);
    expect(nextSpinnerFrame(0)).toBe(1);
    expect(nextSpinnerFrame(3)).toBe(0);
  });
  it("ticks at ~200ms", () => {
    expect(SPINNER_INTERVAL_MS).toBe(200);
  });
  it("the reduced-motion frame is | — never confusable with ended's en dash", () => {
    expect(SPINNER_FRAMES[SPINNER_STATIC_FRAME]).toBe("|");
    expect(SPINNER_FRAMES[SPINNER_STATIC_FRAME]).not.toBe(GLYPH.ended.char);
    expect(GLYPH.working.char).toBe(SPINNER_FRAMES[SPINNER_STATIC_FRAME]);
  });
});

describe("glyphTitle — hover tooltip spells the glyph out", () => {
  it('reads "state · management", lowercased', () => {
    expect(glyphTitle("waiting", "observed")).toBe("waiting · observed");
    expect(glyphTitle("working", "managed")).toBe("working · managed");
  });
});
