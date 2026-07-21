import { describe, it, expect } from "vitest";
import {
  BAR_MARK,
  BAR_SWEEP_DELAYS_MS,
  glyphTitle,
} from "../../src/renderer/src/ui/session-glyph";

describe("BAR_MARK — every session state is the same four-slot mark", () => {
  it("working sweeps in teal at full bar height", () => {
    expect(BAR_MARK.working).toEqual({
      tone: "bg-working-bright",
      height: "h-2.5",
      sweep: true,
    });
  });
  it("waiting flashes amber in unison — a wrapper animation, never a sweep", () => {
    expect(BAR_MARK.waiting).toEqual({
      tone: "bg-accent-bright",
      height: "h-2.5",
      animate: "animate-glyph-breathe motion-reduce:animate-none",
    });
    // The distinction that carries the encoding: unison (wrapper) vs traveling peak (per bar).
    expect(BAR_MARK.waiting.sweep).toBeUndefined();
  });
  it("idle is a quiet constant gray — dimmed, never animated", () => {
    expect(BAR_MARK.idle).toEqual({
      tone: "bg-idle",
      height: "h-2.5",
      dim: "opacity-55",
    });
    expect(BAR_MARK.idle.animate).toBeUndefined();
  });
  it("ended is the same bars squeezed flat to a dim dash", () => {
    expect(BAR_MARK.ended).toEqual({ tone: "bg-ink-600", height: "h-px" });
    expect(BAR_MARK.ended.sweep).toBeUndefined();
    expect(BAR_MARK.ended.animate).toBeUndefined();
  });
  it("only working carries motion that varies per bar", () => {
    expect(
      Object.entries(BAR_MARK)
        .filter(([, mark]) => mark.sweep)
        .map(([state]) => state),
    ).toEqual(["working"]);
  });
});

describe("bar-sweep stagger", () => {
  it("has 4 delays, one per slot, in ascending order", () => {
    expect(BAR_SWEEP_DELAYS_MS).toEqual([0, 160, 320, 480]);
    // Ascending order is what makes the brightness peak travel left-to-right (then, via the
    // CSS animation's `alternate` direction, back right-to-left) — a descending or shuffled
    // order would still animate, just not sweep in a readable direction.
    expect(
      BAR_SWEEP_DELAYS_MS.every(
        (delay, i) => i === 0 || delay > BAR_SWEEP_DELAYS_MS[i - 1],
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
