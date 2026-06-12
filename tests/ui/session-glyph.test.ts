import { describe, it, expect } from "vitest";
import {
  glyphClass,
  glyphTitle,
  glyphPulses,
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
