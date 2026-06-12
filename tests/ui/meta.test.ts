import { describe, it, expect } from "vitest";
import {
  honestModelLabel,
  MODEL_LABEL,
  MODEL_SHORT,
  ctxColor,
  isContextHigh,
  CONTEXT_WARN_PCT,
  STATE_META,
} from "../../src/renderer/src/ui/meta";

describe("honestModelLabel", () => {
  it("shows the clean label for a recognized model (the [1m] tag still matches opus)", () => {
    expect(
      honestModelLabel(
        "claude-opus-4-8",
        "claude-opus-4-8[1m]",
        "Opus 4.8 (1M context)",
        MODEL_LABEL,
      ),
    ).toBe("Opus 4.8");
  });

  it("shows the capture's display_name for a model absent from the table", () => {
    expect(
      honestModelLabel(
        "claude-opus-4-8",
        "claude-neo-1",
        "Claude Neo 1",
        MODEL_LABEL,
      ),
    ).toBe("Claude Neo 1");
  });

  it("shows the raw model id (never the Opus fallback) for an unrecognized model whose capture omitted display_name", () => {
    expect(
      honestModelLabel(
        "claude-opus-4-8",
        "claude-neo-1",
        undefined,
        MODEL_LABEL,
      ),
    ).toBe("claude-neo-1");
    expect(
      honestModelLabel("claude-opus-4-8", "claude-neo-1", "", MODEL_LABEL),
    ).toBe("claude-neo-1");
  });

  it("falls back to the clean label when there is no capture", () => {
    expect(
      honestModelLabel("claude-sonnet-4-6", undefined, undefined, MODEL_SHORT),
    ).toBe("Sonnet");
  });
});

describe("ctxColor — context ring fill, same thresholds as barFill", () => {
  it("is sky (wire) while roomy, below 70%", () => {
    expect(ctxColor(0)).toBe("var(--color-primary)");
    expect(ctxColor(69)).toBe("var(--color-primary)");
  });

  it("warms to amber from 70%", () => {
    expect(ctxColor(70)).toBe("var(--color-accent)");
    expect(ctxColor(84)).toBe("var(--color-accent)");
  });

  it("brightens at 85% and above", () => {
    expect(ctxColor(85)).toBe("var(--color-accent-bright)");
    expect(ctxColor(100)).toBe("var(--color-accent-bright)");
  });
});

describe("isContextHigh — the sidebar only shows the % once it warms to amber", () => {
  it("is the 70% warning threshold, matching ctxTone", () => {
    expect(CONTEXT_WARN_PCT).toBe(70);
    expect(isContextHigh(0)).toBe(false);
    expect(isContextHigh(69)).toBe(false);
    expect(isContextHigh(70)).toBe(true);
    expect(isContextHigh(85)).toBe(true);
    expect(isContextHigh(100)).toBe(true);
  });
});

describe("STATE_META — literal Tailwind classes so the scanner emits them", () => {
  it("gives every state a bg- dot and a border- ring as literal strings", () => {
    for (const m of Object.values(STATE_META)) {
      expect(m.dot.startsWith("bg-")).toBe(true);
      expect(m.ring.startsWith("border-")).toBe(true);
    }
  });
});
