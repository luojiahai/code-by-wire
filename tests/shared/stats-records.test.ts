import { describe, it, expect } from "vitest";
import { daysBetween, longestStreak, currentStreak } from "@shared/stats";

describe("daysBetween", () => {
  it("counts a single day as 1", () => {
    expect(daysBetween("2026-06-14", "2026-06-14")).toBe(1);
  });

  it("counts an inclusive span", () => {
    expect(daysBetween("2026-06-08", "2026-06-14")).toBe(7);
  });

  it("crosses month and year ends", () => {
    expect(daysBetween("2026-06-28", "2026-07-03")).toBe(6);
    expect(daysBetween("2025-12-30", "2026-01-02")).toBe(4);
  });

  it("returns 0 when start is after end", () => {
    expect(daysBetween("2026-06-15", "2026-06-14")).toBe(0);
  });
});

describe("longestStreak", () => {
  it("is 0 for no days", () => {
    expect(longestStreak([])).toBe(0);
  });

  it("is 1 for a single day", () => {
    expect(longestStreak(["2026-06-14"])).toBe(1);
  });

  it("finds the longest run across gaps", () => {
    // runs: 2 (Jun 1-2), 3 (Jun 10-12), 1 (Jun 20)
    expect(
      longestStreak([
        "2026-06-01",
        "2026-06-02",
        "2026-06-10",
        "2026-06-11",
        "2026-06-12",
        "2026-06-20",
      ]),
    ).toBe(3);
  });

  it("runs across a year boundary", () => {
    expect(
      longestStreak(["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"]),
    ).toBe(4);
  });
});

describe("currentStreak", () => {
  it("is 0 for no days", () => {
    expect(currentStreak([], "2026-06-14")).toBe(0);
  });

  it("counts back from an active today", () => {
    expect(
      currentStreak(["2026-06-12", "2026-06-13", "2026-06-14"], "2026-06-14"),
    ).toBe(3);
  });

  it("anchors to yesterday when today has no turn yet", () => {
    expect(
      currentStreak(["2026-06-12", "2026-06-13"], "2026-06-14"),
    ).toBe(2);
  });

  it("is 0 when both today and yesterday are idle", () => {
    expect(currentStreak(["2026-06-10", "2026-06-11"], "2026-06-14")).toBe(0);
  });

  it("stops at the first gap", () => {
    expect(
      currentStreak(
        ["2026-06-09", "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14"],
        "2026-06-14",
      ),
    ).toBe(4);
  });
});
