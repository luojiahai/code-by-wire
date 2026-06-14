import { describe, it, expect } from "vitest";
import {
  weekdayOf,
  calendarGrid,
  intensityThresholds,
  intensityLevel,
  monthLabelCols,
} from "../../src/renderer/src/ui/contributions-geom";

describe("weekdayOf", () => {
  it("is 0 for Sunday through 6 for Saturday (local)", () => {
    // 2026-06-14 is a Sunday.
    expect(weekdayOf("2026-06-14")).toBe(0);
    expect(weekdayOf("2026-06-15")).toBe(1); // Monday
    expect(weekdayOf("2026-06-20")).toBe(6); // Saturday
  });
});

describe("calendarGrid", () => {
  it("pads back to the Sunday on/before start and forward to the Saturday on/after end", () => {
    // Start Wed 2026-06-17, end Thu 2026-06-25.
    const weeks = calendarGrid("2026-06-17", "2026-06-25");
    // First column starts on Sunday 2026-06-14; last column ends Saturday 2026-06-27.
    expect(weeks[0][0]).toEqual({ day: "2026-06-14", inRange: false });
    expect(weeks[0][3]).toEqual({ day: "2026-06-17", inRange: true }); // Wed, first in-range
    const last = weeks[weeks.length - 1];
    expect(last[6]).toEqual({ day: "2026-06-27", inRange: false }); // padded Saturday
    expect(last[4]).toEqual({ day: "2026-06-25", inRange: true }); // Thu, last in-range
  });

  it("makes every column exactly seven cells, row 0 = Sunday", () => {
    const weeks = calendarGrid("2026-06-14", "2026-06-30");
    for (const col of weeks) {
      expect(col).toHaveLength(7);
      expect(weekdayOf(col[0].day)).toBe(0);
    }
  });

  it("returns [] when start is after end", () => {
    expect(calendarGrid("2026-06-15", "2026-06-14")).toEqual([]);
  });

  it("renders a single-day window as one padded week column", () => {
    // Wed 2026-06-17: one column, only the Wednesday row in-range.
    const weeks = calendarGrid("2026-06-17", "2026-06-17");
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[0].filter((c) => c.inRange)).toEqual([
      { day: "2026-06-17", inRange: true },
    ]);
  });
});

describe("intensityThresholds / intensityLevel", () => {
  it("buckets a spread of positive values across levels 1..4", () => {
    const t = intensityThresholds([10, 20, 30, 40], 5);
    expect(intensityLevel(0, t)).toBe(0); // no activity
    expect(intensityLevel(10, t)).toBe(1);
    expect(intensityLevel(20, t)).toBe(2);
    expect(intensityLevel(30, t)).toBe(3);
    expect(intensityLevel(40, t)).toBe(4);
  });

  it("treats zero and negative as level 0", () => {
    const t = intensityThresholds([5, 9], 5);
    expect(intensityLevel(0, t)).toBe(0);
    expect(intensityLevel(-3, t)).toBe(0);
  });

  it("has no thresholds and only level 0 when nothing is positive", () => {
    expect(intensityThresholds([0, 0, 0], 5)).toEqual([]);
    expect(intensityLevel(0, [])).toBe(0);
  });

  it("collapses a flat distribution so the level never exceeds the peak band", () => {
    const t = intensityThresholds([5, 5, 5, 5], 5);
    expect(intensityLevel(5, t)).toBeLessThanOrEqual(4);
    expect(intensityLevel(5, t)).toBeGreaterThanOrEqual(1);
  });

  it("is non-decreasing as the value grows", () => {
    const t = intensityThresholds([10, 20, 30, 40], 5);
    const levels = [0, 5, 10, 15, 20, 25, 30, 35, 40, 99].map((v) =>
      intensityLevel(v, t),
    );
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
  });

  it("yields no thresholds for one level (no-activity-only scale)", () => {
    expect(intensityThresholds([10, 20, 30], 1)).toEqual([]);
  });
});

describe("monthLabelCols", () => {
  it("labels the column where each new month first appears in range", () => {
    // A full month grid: June 2026 (Jun 1 is a Monday).
    const weeks = calendarGrid("2026-06-01", "2026-07-15");
    const labels = monthLabelCols(weeks);
    // Jun appears in column 0; Jul appears once July's first in-range day shows up.
    expect(labels[0]).toEqual({ col: 0, firstDay: "2026-06-01" });
    expect(labels.some((l) => l.firstDay.startsWith("2026-07"))).toBe(true);
  });
});
