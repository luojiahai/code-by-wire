import { describe, expect, it } from "vitest";
import { pickWindow } from "@shared/statusline";

const NOW = 1_760_000_000_000;
const live = (usedPct: number, aheadMs: number) => ({
  usedPct,
  resetsAt: NOW + aheadMs,
});

describe("pickWindow", () => {
  // THE 38% REPRO: the selected session's own window (22%) wins; another session's latched 38%
  // is unreachable BY SIGNATURE — pickWindow only ever sees the selected session's window and
  // the API's, never a third session's.
  it("session window wins over the API window", () => {
    expect(pickWindow(live(22, 60_000), live(21, 120_000), NOW)).toEqual(
      live(22, 60_000),
    );
  });

  it("expired session window falls through to the API window", () => {
    expect(pickWindow(live(38, -1), live(22, 60_000), NOW)).toEqual(
      live(22, 60_000),
    );
  });

  it("API-only fills when the session has no window", () => {
    expect(pickWindow(undefined, live(22, 60_000), NOW)).toEqual(
      live(22, 60_000),
    );
  });

  it("an expired API window is dropped too", () => {
    expect(pickWindow(undefined, live(22, -1), NOW)).toBeUndefined();
  });

  it("both absent → undefined (dashed row)", () => {
    expect(pickWindow(undefined, undefined, NOW)).toBeUndefined();
  });
});
