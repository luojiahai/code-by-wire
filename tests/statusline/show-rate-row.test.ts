import { describe, expect, it } from "vitest";
import { showRateRow } from "@shared/statusline";

const NOW = 1_760_000_000_000;
const live = (usedPct: number, aheadMs: number) => ({
  usedPct,
  resetsAt: NOW + aheadMs,
});

describe("showRateRow", () => {
  it("static rows always render, fetched with a window present", () => {
    expect(showRateRow(false, true, live(22, 60_000))).toBe(true);
  });

  it("static rows always render, fetched with no window", () => {
    expect(showRateRow(false, true, undefined)).toBe(true);
  });

  it("static rows always render, not yet fetched", () => {
    expect(showRateRow(false, false, undefined)).toBe(true);
  });

  it("fetched-only not-yet-fetched renders even with no window (unknown, not confirmed absent)", () => {
    expect(showRateRow(true, false, undefined)).toBe(true);
  });

  it("fetched-only not-yet-fetched renders when a window happens to be present", () => {
    expect(showRateRow(true, false, live(22, 60_000))).toBe(true);
  });

  it("fetched-only fetched with a window present renders", () => {
    expect(showRateRow(true, true, live(22, 60_000))).toBe(true);
  });

  it("fetched-only fetched with no window is confirmed absent → hidden", () => {
    expect(showRateRow(true, true, undefined)).toBe(false);
  });
});
