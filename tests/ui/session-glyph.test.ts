import { describe, it, expect } from "vitest";
import {
  glyphClass,
  glyphTitle,
  glyphPulses,
  glyphSpins,
  glyphTone,
  STATE_ICON,
} from "../../src/renderer/src/ui/session-glyph";

describe("glyphClass — color = state, fill = management", () => {
  it("is a filled state dot for a managed session", () => {
    expect(glyphClass("working", "managed")).toBe("bg-working");
    expect(glyphClass("waiting", "managed")).toBe("bg-accent");
    expect(glyphClass("idle", "managed")).toBe("bg-idle");
    expect(glyphClass("ended", "managed")).toBe("bg-ink-600");
  });

  it("is a hollow ring in the same state color for an observed session", () => {
    expect(glyphClass("waiting", "observed")).toBe(
      "border-[1.5px] bg-transparent border-accent",
    );
    expect(glyphClass("working", "observed")).toBe(
      "border-[1.5px] bg-transparent border-working",
    );
    expect(glyphClass("ended", "observed")).toBe(
      "border-[1.5px] bg-transparent border-ink-600",
    );
  });
});

describe("glyphTitle — hover tooltip spells the glyph out", () => {
  it('reads "state · management", lowercased', () => {
    expect(glyphTitle("waiting", "observed")).toBe("waiting · observed");
    expect(glyphTitle("working", "managed")).toBe("working · managed");
  });
});

describe("glyphPulses — only the live states animate", () => {
  it("pulses for working and waiting, not idle or ended", () => {
    expect(glyphPulses("working")).toBe(true);
    expect(glyphPulses("waiting")).toBe(true);
    expect(glyphPulses("idle")).toBe(false);
    expect(glyphPulses("ended")).toBe(false);
  });
});

describe("STATE_ICON — shape carries state for the row tile", () => {
  it("maps each state to its chosen lucide glyph", () => {
    expect(STATE_ICON.working).toBe("loader-circle");
    expect(STATE_ICON.waiting).toBe("messages-square");
    expect(STATE_ICON.idle).toBe("clock");
    expect(STATE_ICON.ended).toBe("archive");
  });
});

describe("glyphTone — management sets the monochrome tone", () => {
  it("is muted for managed, one step fainter for observed", () => {
    expect(glyphTone("managed")).toBe("text-fg-muted");
    expect(glyphTone("observed")).toBe("text-fg-faint");
  });
});

describe("glyphSpins — only Working spins", () => {
  it("spins for working, and nothing else", () => {
    expect(glyphSpins("working")).toBe(true);
    expect(glyphSpins("waiting")).toBe(false);
    expect(glyphSpins("idle")).toBe(false);
    expect(glyphSpins("ended")).toBe(false);
  });
});
