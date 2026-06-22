import { describe, it, expect } from "vitest";
import {
  modelLabel,
  ctxColor,
  isContextHigh,
  CONTEXT_WARN_PCT,
  STATE_META,
} from "../../src/renderer/src/ui/meta";

describe("modelLabel", () => {
  it("shows Family (raw) for a recognized model", () => {
    expect(modelLabel("opus", "claude-opus-4-8", "Opus 4.8 (1M context)")).toBe(
      "Opus (claude-opus-4-8)",
    );
  });
  it("surfaces the [1m] tag verbatim", () => {
    expect(modelLabel("opus", "claude-opus-4-8[1m]", undefined)).toBe(
      "Opus (claude-opus-4-8[1m])",
    );
  });
  it("shows the full provider-prefixed id", () => {
    expect(
      modelLabel("opus", "global.anthropic.claude-opus-4-7", undefined),
    ).toBe("Opus (global.anthropic.claude-opus-4-7)");
  });
  it("labels Fable correctly", () => {
    expect(modelLabel("fable", "claude-fable-5", "Claude Fable 5")).toBe(
      "Fable (claude-fable-5)",
    );
  });
  it("shows the capture display_name for a raw matching no family", () => {
    expect(modelLabel("fable", "claude-neo-1", "Claude Neo 1")).toBe(
      "Claude Neo 1",
    );
  });
  it("shows the raw id when an unknown model omitted display_name", () => {
    expect(modelLabel("fable", "claude-neo-1", undefined)).toBe("claude-neo-1");
  });
  it("shows bare family when there is no raw", () => {
    expect(modelLabel("sonnet", undefined, undefined)).toBe("Sonnet");
  });
  it("shows Unknown when there is no raw and the family is not vouched for", () => {
    expect(modelLabel("opus", undefined, undefined, { known: false })).toBe(
      "Unknown",
    );
  });
  it("trusts the family with no raw when vouched for (a Managed session)", () => {
    expect(modelLabel("opus", undefined, undefined, { known: true })).toBe(
      "Opus",
    );
  });
  it("follows the live raw id's family when it outruns the stale transcript family", () => {
    // After /model switches Sonnet → Opus, the live statusLine modelId becomes the Opus id before the
    // transcript records an Opus turn, so the passed family is still "sonnet". The label must read the
    // family off the live id, not the stale family — else it shows "Sonnet (claude-opus-4-8)".
    expect(
      modelLabel("sonnet", "claude-opus-4-8", "Opus 4.8 (1M context)"),
    ).toBe("Opus (claude-opus-4-8)");
  });
  it("shows the real id, not Unknown, even when not vouched for, if a raw exists", () => {
    expect(
      modelLabel("sonnet", "global.anthropic.claude-sonnet-4-6", undefined, {
        known: false,
      }),
    ).toBe("Sonnet (global.anthropic.claude-sonnet-4-6)");
  });
  it("shows bare family in compact mode", () => {
    expect(
      modelLabel("opus", "claude-opus-4-8", undefined, { compact: true }),
    ).toBe("Opus");
  });
});

describe("ctxColor — context ring fill, same thresholds as barFill", () => {
  it("is neutral steel while roomy, below 70%", () => {
    expect(ctxColor(0)).toBe("var(--color-steel)");
    expect(ctxColor(69)).toBe("var(--color-steel)");
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
