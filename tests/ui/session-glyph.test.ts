import { describe, it, expect } from "vitest";
import {
  LAMP,
  glyphTitle,
  providerBadge,
} from "../../src/renderer/src/ui/session-glyph";

describe("LAMP — filled = live, hollow = quiet", () => {
  it("working is an 11px spinning arc with a static teal core", () => {
    expect(LAMP.working.outer).toBe(
      "h-[11px] w-[11px] rounded-full border-[1.5px] border-working/25 border-t-working animate-spin motion-reduce:animate-none",
    );
    expect(LAMP.working.core).toBe(
      "absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-working",
    );
  });

  it("waiting is a filled amber dot breathing a halo", () => {
    expect(LAMP.waiting.outer).toBe(
      "h-1.5 w-1.5 rounded-full bg-accent animate-halo motion-reduce:animate-none",
    );
  });

  it("idle is a hollow ring — quiet, not gone", () => {
    expect(LAMP.idle.outer).toBe(
      "h-1.5 w-1.5 rounded-full border-[1.5px] border-idle bg-transparent",
    );
  });

  it("ended is a barely-there ember", () => {
    expect(LAMP.ended.outer).toBe("h-1 w-1 rounded-full bg-ink-700");
  });

  it("only working carries a core layer", () => {
    expect(LAMP.working.core).toBeDefined();
    expect(LAMP.waiting.core).toBeUndefined();
    expect(LAMP.idle.core).toBeUndefined();
    expect(LAMP.ended.core).toBeUndefined();
  });
});

describe("glyphTitle — hover tooltip spells the lamp out", () => {
  it('reads "state · management", lowercased', () => {
    expect(glyphTitle("waiting", "observed")).toBe("waiting · observed");
    expect(glyphTitle("working", "managed")).toBe("working · managed");
  });
});

describe("providerBadge — foreign-CLI marker", () => {
  it("marks codex sessions and stays silent for claude (including pre-field rows)", () => {
    expect(providerBadge("codex")).toBe("codex");
    expect(providerBadge("claude")).toBeNull();
    expect(providerBadge(undefined)).toBeNull();
  });
});
