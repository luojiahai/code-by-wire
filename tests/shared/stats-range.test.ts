import { describe, it, expect } from "vitest";
import { rangeSinceMs, DEFAULT_RANGE } from "@shared/stats";

// A fixed local wall-clock instant to anchor the boundary assertions: 14 Jun 2026, 14:30 local.
// new Date(year, monthIndex, day, ...) builds a LOCAL instant (month is 0-indexed → 5 = June), so the
// expected boundaries below are constructed independently of rangeSinceMs's own setHours/setDate path.
const NOON = new Date(2026, 5, 14, 14, 30, 0).getTime();

describe("rangeSinceMs", () => {
  it("defaults the product range to 30d", () => {
    expect(DEFAULT_RANGE).toBe("30d");
  });

  it("returns null for all-time (no lower bound)", () => {
    expect(rangeSinceMs("all", NOON)).toBeNull();
  });

  it("today is the start of the current local day", () => {
    expect(rangeSinceMs("today", NOON)).toBe(
      new Date(2026, 5, 14, 0, 0, 0, 0).getTime(),
    );
  });

  it("7d starts six local days before today (seven inclusive days)", () => {
    expect(rangeSinceMs("7d", NOON)).toBe(
      new Date(2026, 5, 8, 0, 0, 0, 0).getTime(),
    );
  });

  it("30d starts twenty-nine local days before today", () => {
    expect(rangeSinceMs("30d", NOON)).toBe(
      new Date(2026, 4, 16, 0, 0, 0, 0).getTime(),
    );
  });

  it("90d starts eighty-nine local days before today", () => {
    expect(rangeSinceMs("90d", NOON)).toBe(
      new Date(2026, 2, 17, 0, 0, 0, 0).getTime(),
    );
  });

  it("snaps to local midnight regardless of the time of day", () => {
    const lateNight = new Date(2026, 5, 14, 23, 59, 59, 999).getTime();
    const ms = rangeSinceMs("today", lateNight)!;
    const d = new Date(ms);
    expect([
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
      d.getMilliseconds(),
    ]).toEqual([0, 0, 0, 0]);
    expect(ms).toBeLessThanOrEqual(lateNight);
  });
});
