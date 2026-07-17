import { describe, it, expect } from "vitest";
import {
  DOCK_GLYPH,
  DOCK_GLYPH_PULSE,
  taskDockStatus,
  subagentDockStatus,
} from "../../src/renderer/src/workspace/panels/dock-status-glyph";

describe("DOCK_GLYPH — one status vocabulary for all four dock tabs", () => {
  it("active is a pulsing teal dot (the Shells/Monitors treatment, now everywhere)", () => {
    expect(DOCK_GLYPH.active).toEqual({
      char: "●",
      tone: "text-working-bright",
      animate: true,
    });
  });
  it("done is a green check — the theme's own ok semantic", () => {
    expect(DOCK_GLYPH.done).toEqual({ char: "✓", tone: "text-ok" });
  });
  it("failed is a red cross", () => {
    expect(DOCK_GLYPH.failed).toEqual({ char: "✕", tone: "text-danger" });
  });
  it("stopped is a calm grey square", () => {
    expect(DOCK_GLYPH.stopped).toEqual({ char: "■", tone: "text-fg-faint" });
  });
  it("pending and blocked keep Tasks' existing treatment", () => {
    expect(DOCK_GLYPH.pending).toEqual({
      char: "○",
      tone: "text-(--ui-text-secondary)",
    });
    expect(DOCK_GLYPH.blocked).toEqual({
      char: "⊘",
      tone: "text-accent-bright",
    });
  });
  it("only active animates", () => {
    const animated = Object.entries(DOCK_GLYPH)
      .filter(([, g]) => g.animate)
      .map(([k]) => k);
    expect(animated).toEqual(["active"]);
  });
  it("the pulse class carries the reduced-motion guard", () => {
    expect(DOCK_GLYPH_PULSE).toBe(
      "animate-pulse-soft motion-reduce:animate-none",
    );
  });
});

describe("domain → canonical status mappers", () => {
  it("maps Task statuses", () => {
    expect(taskDockStatus("completed")).toBe("done");
    expect(taskDockStatus("in_progress")).toBe("active");
    expect(taskDockStatus("blocked")).toBe("blocked");
    expect(taskDockStatus("pending")).toBe("pending");
  });
  it("maps Subagent statuses", () => {
    expect(subagentDockStatus("working")).toBe("active");
    expect(subagentDockStatus("done")).toBe("done");
    expect(subagentDockStatus("failed")).toBe("failed");
    expect(subagentDockStatus("stopped")).toBe("stopped");
  });
});
