import { describe, it, expect } from "vitest";
import {
  formatRelativeTime,
  formatResetCountdown,
  formatTokens,
  formatDuration,
  formatTokensShort,
  formatTokensAxis,
  formatTps,
  formatClock,
  formatMonthShort,
} from "@shared/format";

describe("formatRelativeTime", () => {
  const now = 1_000_000_000;

  it("renders coarse buckets from seconds to days", () => {
    expect(formatRelativeTime(now - 2_000, now)).toBe("now"); // 2s
    expect(formatRelativeTime(now - 45_000, now)).toBe("45s ago");
    expect(formatRelativeTime(now - 600_000, now)).toBe("10m ago");
    expect(formatRelativeTime(now - 7_200_000, now)).toBe("2h ago");
    expect(formatRelativeTime(now - 172_800_000, now)).toBe("2d ago");
  });

  it("never goes negative for a future timestamp", () => {
    expect(formatRelativeTime(now + 5_000, now)).toBe("now");
  });
});

describe("formatResetCountdown", () => {
  const now = 1_781_000_000_000;

  it("pieces the largest two units and stays short", () => {
    expect(formatResetCountdown(now + 2 * 3_600_000 + 14 * 60_000, now)).toBe(
      "2h 14m",
    );
    expect(formatResetCountdown(now + 2 * 3_600_000, now)).toBe("2h"); // exactly on the hour, no trailing 0m
    expect(
      formatResetCountdown(now + 3 * 86_400_000 + 4 * 3_600_000, now),
    ).toBe("3d 4h");
    expect(formatResetCountdown(now + 90 * 60_000, now)).toBe("1h 30m");
    expect(formatResetCountdown(now + 30 * 60_000, now)).toBe("30m");
    expect(formatResetCountdown(now + 86_400_000, now)).toBe("1d"); // exactly a day, no trailing 0h
  });

  it("collapses under a minute and never goes negative", () => {
    expect(formatResetCountdown(now + 45_000, now)).toBe("<1m");
    expect(formatResetCountdown(now - 5_000, now)).toBe("now");
    expect(formatResetCountdown(now, now)).toBe("now");
  });
});

describe("formatTokens", () => {
  it("groups with thousands separators and floors junk at 0", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(980)).toBe("980");
    expect(formatTokens(80_710)).toBe("80,710");
    expect(formatTokens(1_000_000)).toBe("1,000,000");
    expect(formatTokens(-5)).toBe("0");
    expect(formatTokens(NaN)).toBe("0");
  });
});

describe("formatDuration", () => {
  it("counts up from zero, largest two units, sub-second as tenths", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(400)).toBe("0.4s");
    expect(formatDuration(12_000)).toBe("12s");
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(200_000)).toBe("3m 20s");
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(3_840_000)).toBe("1h 4m");
  });
});

describe("formatTokensShort", () => {
  it("abbreviates with k/M for the dense rail", () => {
    expect(formatTokensShort(128_400)).toBe("128.4k");
    expect(formatTokensShort(2_480_000)).toBe("2.48M");
    expect(formatTokensShort(950)).toBe("950");
    expect(formatTokensShort(0)).toBe("0");
  });
});

describe("formatTokensAxis", () => {
  it("trims trailing-zero decimals so round axis ticks read clean", () => {
    expect(formatTokensAxis(125_000_000)).toBe("125M");
    expect(formatTokensAxis(250_000_000)).toBe("250M");
    expect(formatTokensAxis(12_500_000)).toBe("12.5M");
    expect(formatTokensAxis(1_250_000)).toBe("1.25M");
    expect(formatTokensAxis(2_480_000)).toBe("2.48M");
    expect(formatTokensAxis(5_000)).toBe("5k");
    expect(formatTokensAxis(128_400)).toBe("128.4k");
    expect(formatTokensAxis(950)).toBe("950");
    expect(formatTokensAxis(0)).toBe("0");
  });
});

describe("formatTps", () => {
  it("renders tokens/sec with k for large rates", () => {
    expect(formatTps(86.4)).toBe("86.4 t/s");
    expect(formatTps(1_300)).toBe("1.3k t/s");
    expect(formatTps(0)).toBe("0 t/s");
  });
});

describe("formatClock", () => {
  it("renders an elapsed wall-clock as the largest two units", () => {
    expect(formatClock(6_120_000)).toBe("1h 42m");
    expect(formatClock(42_000)).toBe("42s");
    expect(formatClock(0)).toBe("0s");
  });
});

describe("formatMonthShort", () => {
  it("is the three-letter month of a 'YYYY-MM-DD' key", () => {
    expect(formatMonthShort("2026-06-14")).toBe("Jun");
    expect(formatMonthShort("2024-01-01")).toBe("Jan");
    expect(formatMonthShort("2024-12-31")).toBe("Dec");
  });
});
