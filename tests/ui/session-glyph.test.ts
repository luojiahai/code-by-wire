import { describe, it, expect } from "vitest";
import {
  GLYPH,
  WORKING_BAR_DELAYS_MS,
  WORKING_BAR_TONE,
  glyphTitle,
} from "../../src/renderer/src/ui/session-glyph";

describe("GLYPH — terminal-character session states (waiting/idle/ended)", () => {
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

describe("working bar-sweep constants", () => {
  it("uses the teal working tone as a background (bars are divs, not text)", () => {
    expect(WORKING_BAR_TONE).toBe("bg-working-bright");
  });
  it("has 4 staggered delays, one per bar, in ascending order", () => {
    expect(WORKING_BAR_DELAYS_MS).toEqual([0, 160, 320, 480]);
    // Ascending order is what makes the brightness peak travel left-to-right (then, via the
    // CSS animation's `alternate` direction, back right-to-left) — a descending or shuffled
    // order would still animate, just not sweep in a readable direction.
    expect(
      WORKING_BAR_DELAYS_MS.every(
        (delay, i) => i === 0 || delay > WORKING_BAR_DELAYS_MS[i - 1],
      ),
    ).toBe(true);
  });
});

describe("glyphTitle — hover tooltip spells the glyph out", () => {
  it('reads "state · management", lowercased', () => {
    expect(glyphTitle("waiting", "observed")).toBe("waiting · observed");
    expect(glyphTitle("working", "managed")).toBe("working · managed");
  });
});
