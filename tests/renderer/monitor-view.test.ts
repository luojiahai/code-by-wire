import { describe, it, expect } from "vitest";
import {
  monitorGlyph,
  monitorDetailMeta,
} from "../../src/renderer/src/workspace/panels/monitor-view";

describe("monitorGlyph", () => {
  it("running is a blue pulsing dot", () => {
    expect(monitorGlyph({ status: "running" })).toEqual({
      char: "●",
      tone: "text-working-bright",
    });
  });
  it("completed is a green check", () => {
    expect(monitorGlyph({ status: "completed" })).toEqual({
      char: "✓",
      tone: "text-ok",
    });
  });
  it("failed is a red cross", () => {
    expect(monitorGlyph({ status: "failed" })).toEqual({
      char: "✕",
      tone: "text-danger",
    });
  });
  it("killed and stopped are a grey square", () => {
    expect(monitorGlyph({ status: "killed" })).toEqual({
      char: "■",
      tone: "text-fg-faint",
    });
    expect(monitorGlyph({ status: "stopped" })).toEqual({
      char: "■",
      tone: "text-fg-faint",
    });
  });
});

describe("monitorDetailMeta", () => {
  it("shows the one-word status and the elapsed runtime while running", () => {
    const m = monitorDetailMeta({ status: "running", startMs: 1000 }, 5000);
    expect(m.statusText).toBe("running");
    expect(m.statusGlyph).toBe("●");
    expect(m.runtime).toBe("4s");
  });
  it("shows the final duration once ended", () => {
    expect(
      monitorDetailMeta({ status: "completed", durationMs: 12000 }, 0).runtime,
    ).toBe("12s");
  });
  it("shows an em dash when no timestamp is known", () => {
    expect(monitorDetailMeta({ status: "completed" }, 0).runtime).toBe("—");
  });
});
