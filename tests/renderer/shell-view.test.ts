// tests/renderer/shell-view.test.ts
import { describe, it, expect } from "vitest";
import {
  shellGlyph,
  truncLabel,
  ansiClass,
  shellStatusPill,
  triggerLabel,
  shellMetaSegments,
} from "../../src/renderer/src/workspace/panels/shell-view";

describe("shellGlyph", () => {
  it("running is a blue dot", () => {
    expect(shellGlyph({ status: "running" })).toEqual({
      char: "●",
      tone: "text-working-bright",
    });
  });
  it("completed with exit 0 is a green check", () => {
    expect(shellGlyph({ status: "completed", exitCode: 0 })).toEqual({
      char: "✓",
      tone: "text-ok",
    });
  });
  it("completed with a non-zero exit is a red cross", () => {
    expect(shellGlyph({ status: "completed", exitCode: 1 })).toEqual({
      char: "✕",
      tone: "text-danger",
    });
  });
  it("killed is a grey square", () => {
    expect(shellGlyph({ status: "killed" })).toEqual({
      char: "■",
      tone: "text-fg-faint",
    });
  });
});

describe("truncLabel", () => {
  it("is empty when nothing was dropped", () => {
    expect(truncLabel(0)).toBe("");
  });
  it("reports dropped KB", () => {
    expect(truncLabel(262144)).toBe("256 KB of earlier output hidden");
  });
});

describe("ansiClass", () => {
  it("maps base colors to cbw tokens by hue", () => {
    expect(ansiClass("red")).toBe("text-danger");
    expect(ansiClass("green")).toBe("text-ok");
    expect(ansiClass("blue")).toBe("text-working");
    expect(ansiClass("cyan")).toBe("text-primary");
  });
  it("uses the bright token when available", () => {
    expect(ansiClass("blue", true)).toBe("text-working-bright");
    expect(ansiClass("yellow", true)).toBe("text-accent-bright");
  });
  it("falls back to the base token when no bright variant exists", () => {
    expect(ansiClass("green", true)).toBe("text-ok");
  });
});

describe("shellStatusPill", () => {
  it("running is a pulsing blue dot", () => {
    expect(shellStatusPill({ status: "running" })).toEqual({
      glyph: "●",
      label: "running",
      tone: "text-working-bright",
    });
  });
  it("completed with exit 0 is a green check", () => {
    expect(shellStatusPill({ status: "completed", exitCode: 0 })).toEqual({
      glyph: "✓",
      label: "completed",
      tone: "text-ok",
    });
  });
  it("completed with a non-zero exit reads failed in red", () => {
    expect(shellStatusPill({ status: "completed", exitCode: 1 })).toEqual({
      glyph: "✕",
      label: "failed",
      tone: "text-danger",
    });
  });
  it("killed is a grey square", () => {
    expect(shellStatusPill({ status: "killed" })).toEqual({
      glyph: "■",
      label: "killed",
      tone: "text-fg-faint",
    });
  });
});

describe("triggerLabel", () => {
  it("maps each trigger to its human string", () => {
    expect(triggerLabel("explicit")).toBe("run in background");
    expect(triggerLabel("auto")).toBe("auto-backgrounded");
    expect(triggerLabel("user")).toBe("Ctrl-B");
  });
});

describe("shellMetaSegments", () => {
  it("a clean completed shell: exit, duration, trigger", () => {
    expect(
      shellMetaSegments(
        {
          status: "completed",
          exitCode: 0,
          durationMs: 0,
          trigger: "explicit",
        },
        1000,
      ),
    ).toEqual(["exit 0", "0s", "run in background"]);
  });
  it("a failed shell keeps the non-zero exit and duration", () => {
    expect(
      shellMetaSegments(
        { status: "completed", exitCode: 1, durationMs: 2400, trigger: "auto" },
        1000,
      ),
    ).toEqual(["exit 1", "2s", "auto-backgrounded"]);
  });
  it("a running shell shows elapsed from now and drops exit/duration", () => {
    expect(
      shellMetaSegments(
        { status: "running", startMs: 82_000, trigger: "explicit" },
        100_000,
      ),
    ).toEqual(["elapsed 18s", "run in background"]);
  });
  it("a killed shell omits its signal-derived exit code, matching the row", () => {
    expect(
      shellMetaSegments(
        { status: "killed", exitCode: 137, durationMs: 5000, trigger: "user" },
        1000,
      ),
    ).toEqual(["5s", "Ctrl-B"]);
  });
});
